import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, loginAndroid, resetDb } from './utils';

describe('Auth (Google login, sesi, rotasi refresh token)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  it('login pertama membuat akun CUSTOMER + customer_profile, login berikutnya memakai akun yang sama', async () => {
    const first = await loginAndroid(app, 'google-sub-1', 'Budi@Example.com');
    expect(first.user.role).toBe('CUSTOMER');
    expect(first.user.email).toBe('budi@example.com');

    const user = await prisma.user.findUniqueOrThrow({ where: { googleSub: 'google-sub-1' }, include: { customerProfile: true } });
    expect(user.customerProfile).not.toBeNull();

    const second = await loginAndroid(app, 'google-sub-1', 'budi@example.com');
    expect(second.user.id).toBe(first.user.id);
    expect(await prisma.user.count()).toBe(1);

    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['AUTH_REGISTER_GOOGLE', 'AUTH_LOGIN_GOOGLE']);
  });

  it('menolak token Google yang tidak valid dan email yang belum terverifikasi', async () => {
    await api().post('/api/v1/auth/google').set('X-Forwarded-For', freshIp()).send({ idToken: 'not-a-valid-google-token-xx', client: 'web' }).expect(401);
    await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('sub-x', 'x@example.com', 'X', false), client: 'web' })
      .expect(401);
    expect(await prisma.user.count()).toBe(0);
  });

  it('menolak email yang sudah terikat ke Google subject lain', async () => {
    await loginAndroid(app, 'sub-a', 'same@example.com');
    await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('sub-b', 'same@example.com'), client: 'android' })
      .expect(409);
  });

  it('web: refresh token hanya di cookie httpOnly, tidak di body', async () => {
    const res = await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('sub-web', 'web@example.com'), client: 'web' })
      .expect(200);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/hmc_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('web: refresh via cookie wajib header CSRF', async () => {
    const login = await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('sub-csrf', 'csrf@example.com'), client: 'web' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(403);
    const ok = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).set('x-hmc-csrf', '1').expect(200);
    expect(ok.body.accessToken).toBeDefined();
    expect(String(ok.headers['set-cookie'])).toMatch(/hmc_rt=/);
  });

  it('rotasi: refresh token lama tidak bisa dipakai lagi; reuse mencabut seluruh sesi', async () => {
    const login = await loginAndroid(app);
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(login.refreshToken);

    // Penyerang memakai token lama → ditolak dan family dicabut
    await api().post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
    // Token terbaru milik user sah juga ikut dicabut
    await api().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    // Access token untuk sesi tersebut langsung tidak berlaku
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(401);

    const reuse = await prisma.auditLog.findFirst({ where: { action: 'AUTH_REFRESH_REUSE_DETECTED' } });
    expect(reuse).not.toBeNull();
  });

  it('refresh paralel dengan token yang sama: hanya satu yang berhasil', async () => {
    const login = await loginAndroid(app);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api().post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken })),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeLessThanOrEqual(1);
    expect(results.every((r) => [200, 401].includes(r.status))).toBe(true);
  });

  it('logout mencabut sesi dan access token langsung ditolak', async () => {
    const login = await loginAndroid(app);
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.accessToken}`).expect(200);
    await api().post('/api/v1/auth/logout').send({ refreshToken: login.refreshToken }).expect(204);
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.accessToken}`).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
  });

  it('user yang di-suspend langsung kehilangan akses', async () => {
    const login = await loginAndroid(app);
    await prisma.user.update({ where: { id: login.user.id }, data: { status: 'SUSPENDED' } });
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${login.accessToken}`).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
  });

  it('rate limit pada endpoint login (10/menit per IP)', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await api().post('/api/v1/auth/google').set('X-Forwarded-For', ip).send({ idToken: fakeIdToken(`rl-${i}`, `rl${i}@example.com`), client: 'android' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
