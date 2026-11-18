import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GoogleTokenVerifier, type GoogleIdentity } from '../src/auth/google-verifier';
import { PrismaClient } from '@prisma/client';
import { setupApp } from '../src/setup-app';
import { ENV, loadEnv } from '../src/config/env';
import { Mailer, type MailMessage } from '../src/mail/mailer';

/** Penangkap email untuk test: tidak mengirim apa pun, menyimpan pesan di memori. */
export const sentMail: MailMessage[] = [];
export class CapturingMailer extends Mailer {
  readonly available = true;
  async send(msg: MailMessage) {
    sentMail.push(msg);
  }
}
/** Kode 6 digit terakhir yang dikirim ke email tertentu. */
export function lastCodeFor(email: string): string | null {
  const msg = [...sentMail].reverse().find((m) => m.to === email.toLowerCase());
  return msg ? (/(\d{6})/.exec(msg.subject)?.[1] ?? null) : null;
}

/**
 * Verifier palsu untuk test: token berformat "fake-google-token|sub|email|name|verified".
 * Logika backend lain (pembuatan user, sesi, RBAC) tetap berjalan nyata.
 */
export class FakeGoogleVerifier extends GoogleTokenVerifier {
  async verify(idToken: string): Promise<GoogleIdentity> {
    const [prefix, sub, email, name, verified] = idToken.split('|');
    if (prefix !== 'fake-google-token' || !sub || !email) throw new UnauthorizedException('Token Google tidak valid');
    return { sub, email: email.toLowerCase(), name: name ?? 'Test', emailVerified: verified !== 'false' };
  }
}

export function fakeIdToken(sub: string, email: string, name = 'Test User', verified = true) {
  return ['fake-google-token', sub, email, name, String(verified)].join('|');
}

export async function createTestApp(envOverrides: Record<string, string> = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleTokenVerifier)
    .useClass(FakeGoogleVerifier)
    .overrideProvider(Mailer)
    .useClass(CapturingMailer)
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...envOverrides }))
    .compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

/** Hapus data transaksional; pertahankan data seed (mc_profile, services, business_settings). */
export async function resetDb(prisma: PrismaClient) {
  // DELETE berurutan (bukan TRUNCATE CASCADE) agar tabel seed yang mereferensikan users tidak ikut terhapus.
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.emailLoginCode.deleteMany(),
    prisma.deviceToken.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.paymentProof.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bookingAttachment.deleteMany(),
    prisma.bookingStatusLog.deleteMany(),
    prisma.eventDetail.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.servicePackage.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.customerProfile.deleteMany(),
    prisma.adminProfile.deleteMany(),
    prisma.businessSetting.updateMany({ data: { updatedById: null } }),
    prisma.user.deleteMany(),
  ]);
}

/** IP unik per pemanggilan agar rate limit antar test tidak saling mengganggu (TRUST_PROXY=1 di test). */
export const freshIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export async function loginAndroid(app: INestApplication, sub: string = randomUUID(), email = `${sub.slice(0, 8)}@example.com`) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/google')
    .set('X-Forwarded-For', freshIp())
    .send({ idToken: fakeIdToken(sub, email), client: 'android' })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string; role: string; email: string } };
}
