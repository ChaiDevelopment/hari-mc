import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../common/request-meta';
import type { AccessTokenPayload } from '../common/guards/auth.guard';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleTokenVerifier, type GoogleIdentity } from './google-verifier';
import { generateRefreshToken, hashToken } from './token.util';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: User['role'];
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: PublicUser;
}

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatarUrl,
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly google: GoogleTokenVerifier,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───────────── Login ─────────────

  async loginWithGoogle(idToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    const identity = await this.google.verify(idToken);
    if (!identity.emailVerified) throw new UnauthorizedException('Email Google belum terverifikasi');

    const { user, created } = await this.findOrCreateUser(identity);
    if (user.deletedAt || user.status !== 'ACTIVE') {
      await this.audit.logSafe({
        actorUserId: user.id,
        actorType: 'SYSTEM',
        action: 'AUTH_LOGIN_BLOCKED',
        entityType: 'user',
        entityId: user.id,
        meta,
      });
      throw new ForbiddenException('Akun tidak aktif');
    }

    const tokens = await this.issueTokens(user, randomUUID(), meta);
    await this.audit.logSafe({
      actorUserId: user.id,
      actorType: user.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
      action: created ? 'AUTH_REGISTER_GOOGLE' : 'AUTH_LOGIN_GOOGLE',
      entityType: 'user',
      entityId: user.id,
      meta,
    });
    return tokens;
  }

  /**
   * Login development (tanpa Google). Hanya aktif jika ENABLE_DEV_LOGIN=true dan bukan production
   * (dijaga di env validation + controller). Tidak pernah MEMBUAT admin, dan tidak bisa mengambil alih
   * akun yang sudah terikat ke Google. Masuk ke admin hanya dengan ENABLE_DEV_ADMIN_LOGIN (lihat di bawah).
   */
  async loginDev(email: string, name: string, meta: RequestMeta): Promise<IssuedTokens> {
    if (!this.env.ENABLE_DEV_LOGIN || this.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev login tidak aktif');
    }
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized }, include: { adminProfile: true } });
    let user: User | null = existing;
    // Admin hanya boleh lewat dev login jika flag khusus aktif DAN akun sudah diprovisioning lewat CLI
    // (punya admin_profile) serta belum terikat Google. Dev login tidak pernah membuat admin.
    const devAdminAllowed = this.env.ENABLE_DEV_ADMIN_LOGIN && existing?.role === 'ADMIN' && !!existing.adminProfile && !existing.googleSub;
    if (user && !devAdminAllowed && (user.role !== 'CUSTOMER' || user.googleSub)) {
      throw new ForbiddenException('Akun ini tidak dapat dipakai untuk dev login');
    }
    if (user && (user.deletedAt || user.status !== 'ACTIVE')) throw new ForbiddenException('Akun tidak aktif');
    user = user
      ? await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      : await this.prisma.user.create({
          data: { email: normalized, name, role: 'CUSTOMER', lastLoginAt: new Date(), customerProfile: { create: {} } },
        });
    const tokens = await this.issueTokens(user, randomUUID(), meta);
    await this.audit.logSafe({
      actorUserId: user.id,
      actorType: user.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
      action: user.role === 'ADMIN' ? 'AUTH_DEV_LOGIN_ADMIN' : 'AUTH_DEV_LOGIN',
      entityType: 'user',
      entityId: user.id,
      meta,
    });
    return tokens;
  }

  /**
   * Cari user berdasarkan Google subject (identitas yang stabil).
   * Jika belum ada, cocokkan email terverifikasi ke akun yang sudah diprovisioning (mis. admin Hari)
   * yang belum terikat ke Google. Jika tidak ada sama sekali → buat customer baru.
   */
  async findOrCreateUser(identity: GoogleIdentity, attempt = 0): Promise<{ user: User; created: boolean }> {
    const now = new Date();
    const bySub = await this.prisma.user.findUnique({ where: { googleSub: identity.sub } });
    if (bySub) {
      // Email Google bisa berubah; ikuti hanya jika tidak bentrok dengan akun lain.
      const emailTaken =
        bySub.email !== identity.email &&
        (await this.prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } })) !== null;
      const user = await this.prisma.user.update({
        where: { id: bySub.id },
        data: {
          name: identity.name,
          avatarUrl: identity.picture ?? bySub.avatarUrl,
          email: emailTaken ? bySub.email : identity.email,
          lastLoginAt: now,
        },
      });
      return { user, created: false };
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      if (byEmail.googleSub && byEmail.googleSub !== identity.sub) {
        throw new ConflictException('Email ini sudah terhubung ke akun Google lain');
      }
      // Bind conditional: hanya jika belum terikat (mencegah race dua login bersamaan).
      const bound = await this.prisma.user.updateMany({
        where: { id: byEmail.id, googleSub: null },
        data: { googleSub: identity.sub, avatarUrl: identity.picture ?? byEmail.avatarUrl, lastLoginAt: now },
      });
      if (bound.count === 0 && attempt === 0) return this.findOrCreateUser(identity, 1);
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: byEmail.id } });
      if (user.googleSub !== identity.sub) throw new ConflictException('Email ini sudah terhubung ke akun Google lain');
      return { user, created: false };
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: identity.email,
          googleSub: identity.sub,
          name: identity.name,
          avatarUrl: identity.picture,
          role: 'CUSTOMER',
          lastLoginAt: now,
          customerProfile: { create: {} },
        },
      });
      return { user, created: true };
    } catch (e) {
      // Dua login pertama yang bersamaan: salah satu kena unique violation → ulangi lookup sekali.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt === 0) {
        return this.findOrCreateUser(identity, 1);
      }
      throw e;
    }
  }

  // ───────────── Tokens ─────────────

  private refreshTtlMs(user: User): number {
    const days = user.role === 'ADMIN' ? this.env.REFRESH_TTL_DAYS_ADMIN : this.env.REFRESH_TTL_DAYS_CUSTOMER;
    return days * 24 * 60 * 60 * 1000;
  }

  private signAccessToken(user: User, familyId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, sid: familyId };
    return this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      algorithm: 'HS256',
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      issuer: 'hari-mc-api',
      audience: 'hari-mc-clients',
    });
  }

  /** Sesi baru untuk user yang identitasnya sudah dibuktikan (dipakai login via kode email). */
  issueForUser(user: User, meta: RequestMeta): Promise<IssuedTokens> {
    return this.issueTokens(user, randomUUID(), meta);
  }

  private async issueTokens(
    user: User,
    familyId: string,
    meta: RequestMeta,
    tx: Prisma.TransactionClient = this.prisma,
    replacesId?: string,
  ): Promise<IssuedTokens> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs(user));
    const created = await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    if (replacesId) {
      await tx.refreshToken.update({ where: { id: replacesId }, data: { replacedById: created.id } });
    }
    return {
      accessToken: await this.signAccessToken(user, familyId),
      accessTokenExpiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: toPublicUser(user),
    };
  }

  /**
   * Rotasi refresh token dengan deteksi reuse.
   * Token yang sudah pernah dipakai → seluruh family (sesi) dicabut.
   */
  async refresh(rawToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!existing || existing.revokedAt) throw new UnauthorizedException('Sesi tidak valid');

    if (existing.usedAt) {
      await this.handleReuse(existing.familyId, existing.userId, meta);
      throw new UnauthorizedException('Sesi tidak valid');
    }
    if (existing.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('Sesi kedaluwarsa');

    const user = existing.user;
    if (user.deletedAt || user.status !== 'ACTIVE') {
      await this.revokeFamily(existing.familyId, 'USER_INACTIVE');
      throw new UnauthorizedException('Akun tidak aktif');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Update bersyarat: hanya satu request yang bisa "memakai" token ini.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return null;
      return this.issueTokens(user, existing.familyId, meta, tx, existing.id);
    });

    if (!result) {
      await this.handleReuse(existing.familyId, user.id, meta);
      throw new UnauthorizedException('Sesi tidak valid');
    }
    return result;
  }

  private async handleReuse(familyId: string, userId: string, meta: RequestMeta) {
    await this.revokeFamily(familyId, 'REUSE_DETECTED');
    await this.audit.logSafe({
      actorUserId: userId,
      actorType: 'SYSTEM',
      action: 'AUTH_REFRESH_REUSE_DETECTED',
      entityType: 'session',
      entityId: familyId,
      meta,
    });
  }

  /** Logout berdasarkan refresh token (web cookie / Android body). */
  async logoutByRefreshToken(rawToken: string, meta: RequestMeta): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!existing) return;
    await this.logoutSession(existing.userId, existing.familyId, meta);
  }

  async logoutSession(userId: string, familyId: string, meta: RequestMeta): Promise<void> {
    await this.revokeFamily(familyId, 'LOGOUT', userId);
    await this.audit.logSafe({
      actorUserId: userId,
      actorType: 'SYSTEM',
      action: 'AUTH_LOGOUT',
      entityType: 'session',
      entityId: familyId,
      meta,
    });
  }

  async revokeFamily(familyId: string, reason: string, userId?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null, ...(userId ? { userId } : {}) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }
}
