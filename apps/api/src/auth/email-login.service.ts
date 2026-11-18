import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../common/request-meta';
import { ENV, type Env } from '../config/env';
import { Mailer } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type IssuedTokens } from './auth.service';

export const CODE_TTL_SECONDS = 10 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

/**
 * Masuk / daftar tanpa password: kode 6 digit dikirim ke email. Memiliki kode = membuktikan kepemilikan email.
 * - Kode disimpan sebagai hash (tidak pernah plaintext di database), berlaku 10 menit, sekali pakai.
 * - Maks. 5 percobaan per kode, jeda kirim ulang 60 detik, maks. 5 kode per jam per email.
 * - Respons permintaan kode selalu sama → tidak membocorkan apakah email terdaftar.
 * - Akun ADMIN tidak dapat masuk lewat email (wajib Google).
 */
@Injectable()
export class EmailLoginService {
  private readonly logger = new Logger(EmailLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get available(): boolean {
    return this.mailer.available;
  }

  private hash(email: string, code: string): string {
    return createHash('sha256').update(`${email}:${code}:${this.env.JWT_ACCESS_SECRET}`).digest('hex');
  }

  async requestCode(rawEmail: string, meta: RequestMeta) {
    if (!this.mailer.available) throw new ServiceUnavailableException('Masuk dengan email belum dikonfigurasi');
    const email = rawEmail.trim().toLowerCase();
    const now = Date.now();
    const response = { sent: true, expiresInSeconds: CODE_TTL_SECONDS, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };

    const last = await this.prisma.emailLoginCode.findFirst({ where: { email }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (last && now - last.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (now - last.createdAt.getTime())) / 1000);
      throw new HttpException({ statusCode: 429, code: 'RESEND_COOLDOWN', message: `Tunggu ${wait} detik sebelum meminta kode baru`, retryAfterSeconds: wait }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const recent = await this.prisma.emailLoginCode.count({ where: { email, createdAt: { gte: new Date(now - 3_600_000) } } });
    if (recent >= MAX_CODES_PER_HOUR) {
      throw new HttpException({ statusCode: 429, code: 'TOO_MANY_CODES', message: 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    // Admin & akun nonaktif: tidak dikirimi kode, tetapi responsnya identik (tidak membocorkan status akun).
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true, deletedAt: true } });
    if (user && (user.role === 'ADMIN' || user.status !== 'ACTIVE' || user.deletedAt)) {
      await this.prisma.emailLoginCode.create({ data: { email, codeHash: 'suppressed', expiresAt: new Date(now), consumedAt: new Date(now), ipAddress: meta.ipAddress } });
      await this.audit.logSafe({ actorUserId: user.id, actorType: 'SYSTEM', action: 'AUTH_EMAIL_CODE_SUPPRESSED', entityType: 'user', entityId: user.id, metadata: { reason: user.role === 'ADMIN' ? 'admin_requires_google' : 'inactive' }, meta });
      return response;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // Kode lama yang belum terpakai otomatis tidak berlaku lagi.
    await this.prisma.emailLoginCode.updateMany({ where: { email, consumedAt: null, expiresAt: { gt: new Date(now) } }, data: { expiresAt: new Date(now) } });
    const row = await this.prisma.emailLoginCode.create({
      data: { email, codeHash: this.hash(email, code), expiresAt: new Date(now + CODE_TTL_SECONDS * 1000), ipAddress: meta.ipAddress },
    });

    try {
      await this.mailer.send({
        to: email,
        subject: `Kode masuk Anda: ${code}`,
        text: [
          'Halo,',
          '',
          `Kode masuk Anda untuk website Hari Susanto MC adalah: ${code}`,
          '',
          'Kode berlaku 10 menit dan hanya dapat dipakai sekali.',
          'Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari Hari Susanto.',
          '',
          'Jika Anda tidak meminta kode ini, abaikan email ini.',
        ].join('\n'),
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#17202f">
  <p style="font-size:12px;letter-spacing:3px;color:#a5834a;text-transform:uppercase">Hari Susanto · Master of Ceremony</p>
  <h1 style="font-size:20px;color:#0e192c">Kode masuk Anda</h1>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#0e192c;background:#f8f3ea;padding:16px;text-align:center;border-radius:12px">${code}</p>
  <p>Kode berlaku <strong>10 menit</strong> dan hanya dapat dipakai sekali.</p>
  <p style="color:#5a6474;font-size:13px">Jangan berikan kode ini kepada siapa pun. Jika Anda tidak meminta kode ini, abaikan email ini.</p>
</div>`,
      });
    } catch (e) {
      await this.prisma.emailLoginCode.delete({ where: { id: row.id } }).catch(() => undefined);
      this.logger.error(`Gagal mengirim email kode ke ${email}`, e as Error);
      throw new ServiceUnavailableException('Gagal mengirim email. Coba beberapa saat lagi.');
    }
    await this.audit.logSafe({ actorUserId: user?.id ?? null, actorType: 'SYSTEM', action: 'AUTH_EMAIL_CODE_SENT', entityType: 'email_login_code', entityId: row.id, meta });
    return response;
  }

  async verifyCode(rawEmail: string, code: string, meta: RequestMeta): Promise<IssuedTokens & { isNewUser: boolean }> {
    const email = rawEmail.trim().toLowerCase();
    const invalid = () => new UnauthorizedException({ statusCode: 401, code: 'INVALID_CODE', message: 'Kode salah atau sudah kedaluwarsa. Minta kode baru bila perlu.' });
    const row = await this.prisma.emailLoginCode.findFirst({
      where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw invalid();
    if (row.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException({ statusCode: 401, code: 'TOO_MANY_ATTEMPTS', message: 'Terlalu banyak percobaan. Minta kode baru.' });

    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(this.hash(email, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      await this.prisma.emailLoginCode.updateMany({ where: { id: row.id, attempts: { lt: MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - row.attempts - 1;
      await this.audit.logSafe({ actorType: 'SYSTEM', action: 'AUTH_EMAIL_CODE_FAILED', entityType: 'email_login_code', entityId: row.id, metadata: { attemptsLeft: left }, meta });
      throw new UnauthorizedException({
        statusCode: 401,
        code: left > 0 ? 'WRONG_CODE' : 'TOO_MANY_ATTEMPTS',
        message: left > 0 ? `Kode salah. Sisa ${left} percobaan.` : 'Terlalu banyak percobaan. Minta kode baru.',
        attemptsLeft: Math.max(left, 0),
      });
    }
    // Sekali pakai — update bersyarat aman dari dua verifikasi bersamaan.
    const consumed = await this.prisma.emailLoginCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count === 0) throw invalid();

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.role === 'ADMIN') throw new ForbiddenException('Akun admin hanya dapat masuk dengan Google');
    if (user && (user.deletedAt || user.status !== 'ACTIVE')) throw new ForbiddenException('Akun tidak aktif');
    let isNewUser = false;
    if (user) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } else {
      const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
      const name = (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 120) || 'Pelanggan';
      user = await this.prisma.user.create({ data: { email, name, role: 'CUSTOMER', lastLoginAt: new Date(), customerProfile: { create: {} } } });
      isNewUser = true;
    }
    const tokens = await this.auth.issueForUser(user, meta);
    await this.audit.logSafe({ actorUserId: user.id, actorType: 'CUSTOMER', action: isNewUser ? 'AUTH_REGISTER_EMAIL' : 'AUTH_LOGIN_EMAIL', entityType: 'user', entityId: user.id, meta });
    return { ...tokens, isNewUser };
  }
}
