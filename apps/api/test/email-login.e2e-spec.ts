import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, lastCodeFor, resetDb, sentMail } from './utils';

/** Masuk/daftar dengan kode email (tanpa password). */
describe('Login dengan kode email', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const requestCode = (email: string) => api().post('/api/v1/auth/email/request').set('X-Forwarded-For', freshIp()).send({ email });
  const verify = (email: string, code: string, client: 'web' | 'android' = 'android') =>
    api().post('/api/v1/auth/email/verify').set('X-Forwarded-For', freshIp()).send({ email, code, client });
  /** Mundurkan waktu pembuatan kode agar jeda kirim ulang (60 dtk) tidak menghambat test. */
  const skipCooldown = (email: string) => prisma.emailLoginCode.updateMany({ where: { email }, data: { createdAt: new Date(Date.now() - 61_000) } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await resetDb(prisma);
    sentMail.length = 0;
  });
  afterAll(() => app.close());

  it('daftar: kode terkirim ke email, verifikasi membuat akun CUSTOMER baru dan sesi login', async () => {
    const r = await requestCode('Siti.Baru@Example.com').expect(200);
    expect(r.body).toEqual({ sent: true, expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].to).toBe('siti.baru@example.com');
    expect(sentMail[0].text).toMatch(/berlaku 10 menit/i);
    const code = lastCodeFor('siti.baru@example.com')!;
    expect(code).toMatch(/^\d{6}$/);

    // Kode tidak tersimpan dalam bentuk asli
    const row = await prisma.emailLoginCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(code);
    expect(row.codeHash).toHaveLength(64);

    const v = await verify('siti.baru@example.com', code).expect(200);
    expect(v.body.isNewUser).toBe(true);
    expect(v.body.user).toMatchObject({ role: 'CUSTOMER', email: 'siti.baru@example.com', name: 'Siti baru' });
    expect(v.body.refreshToken).toBeDefined();
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${v.body.accessToken}`).expect(200);
    expect(await prisma.customerProfile.count({ where: { userId: v.body.user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_REGISTER_EMAIL' } })).toBe(1);

    // Kode sekali pakai
    await verify('siti.baru@example.com', code).expect(401);
  });

  it('masuk lagi dengan email yang sama → akun yang sama (bukan akun baru); web memakai cookie httpOnly', async () => {
    await requestCode('budi@example.com').expect(200);
    const first = await verify('budi@example.com', lastCodeFor('budi@example.com')!).expect(200);
    await skipCooldown('budi@example.com');
    await requestCode('budi@example.com').expect(200);
    const second = await verify('budi@example.com', lastCodeFor('budi@example.com')!, 'web').expect(200);
    expect(second.body.isNewUser).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.refreshToken).toBeUndefined();
    expect(String(second.headers['set-cookie'])).toMatch(/hmc_rt=.*HttpOnly/i);
  });

  it('pelanggan yang sebelumnya daftar via Google bisa masuk dengan kode email (akun yang sama)', async () => {
    const g = await api().post('/api/v1/auth/google').set('X-Forwarded-For', freshIp()).send({ idToken: fakeIdToken('g-sub', 'ani@example.com'), client: 'android' }).expect(200);
    await requestCode('ani@example.com').expect(200);
    const v = await verify('ani@example.com', lastCodeFor('ani@example.com')!).expect(200);
    expect(v.body.user.id).toBe(g.body.user.id);
    expect(v.body.isNewUser).toBe(false);
  });

  it('kode salah: sisa percobaan berkurang; setelah 5 kali kode hangus walau kemudian benar', async () => {
    await requestCode('tebak@example.com').expect(200);
    const code = lastCodeFor('tebak@example.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    const r1 = await verify('tebak@example.com', wrong).expect(401);
    expect(r1.body).toMatchObject({ code: 'WRONG_CODE', attemptsLeft: 4 });
    for (let i = 0; i < 4; i++) await verify('tebak@example.com', wrong).expect(401);
    const locked = await verify('tebak@example.com', code).expect(401);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(await prisma.user.count()).toBe(0);
  });

  it('kode kedaluwarsa ditolak; minta kode baru membatalkan kode lama', async () => {
    await requestCode('lama@example.com').expect(200);
    const old = lastCodeFor('lama@example.com')!;
    await skipCooldown('lama@example.com');
    await requestCode('lama@example.com').expect(200);
    const fresh = lastCodeFor('lama@example.com')!;
    if (old !== fresh) await verify('lama@example.com', old).expect(401);
    await prisma.emailLoginCode.updateMany({ where: { email: 'lama@example.com', consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await verify('lama@example.com', fresh).expect(401);
  });

  it('pembatasan: jeda 60 detik antar permintaan dan maksimal 5 kode per jam per email', async () => {
    await requestCode('spam@example.com').expect(200);
    const cool = await requestCode('spam@example.com').expect(429);
    expect(cool.body.code).toBe('RESEND_COOLDOWN');
    for (let i = 0; i < 4; i++) {
      await skipCooldown('spam@example.com');
      await requestCode('spam@example.com').expect(200);
    }
    await skipCooldown('spam@example.com');
    expect((await requestCode('spam@example.com').expect(429)).body.code).toBe('TOO_MANY_CODES');
    expect(sentMail).toHaveLength(5);
  });

  it('akun admin tidak bisa masuk via email; respons sama seperti biasa (tidak membocorkan status akun)', async () => {
    await prisma.user.create({ data: { email: 'hari@example.com', name: 'Hari', role: 'ADMIN' } });
    const r = await requestCode('hari@example.com').expect(200);
    expect(r.body).toEqual({ sent: true, expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(sentMail).toHaveLength(0); // kode tidak dikirim
    await verify('hari@example.com', '123456').expect(401);
  });

  it('validasi input & mass assignment', async () => {
    await requestCode('bukan-email').expect(400);
    await api().post('/api/v1/auth/email/request').set('X-Forwarded-For', freshIp()).send({ email: 'a@example.com', role: 'ADMIN' }).expect(400);
    await verify('a@example.com', '12ab56').expect(400);
    await verify('a@example.com', '1234567').expect(400);
  });

  it('config melaporkan login email tersedia', async () => {
    const cfg = await api().get('/api/v1/auth/config').expect(200);
    expect(cfg.body.emailLoginEnabled).toBe(true);
  });
});
