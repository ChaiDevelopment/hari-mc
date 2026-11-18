import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, loginAndroid, resetDb } from './utils';

const provision = (args: string) =>
  execSync(`pnpm exec tsx scripts/provision-admin.ts ${args}`, { cwd: join(__dirname, '..'), env: process.env, stdio: 'pipe' }).toString();

describe('RBAC & admin provisioning', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  /** Semua route admin dari dokumen OpenAPI — test otomatis mencakup endpoint admin baru di fase berikutnya. */
  function adminRoutes(): Array<{ method: string; path: string }> {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const routes: Array<{ method: string; path: string }> = [];
    for (const [path, ops] of Object.entries(doc.paths)) {
      if (!path.startsWith('/api/v1/admin')) continue;
      for (const method of Object.keys(ops)) {
        routes.push({ method, path: path.replace(/\{[^}]+\}/g, '00000000-0000-0000-0000-000000000000') });
      }
    }
    return routes;
  }

  it('ada setidaknya satu route admin yang diuji', () => {
    expect(adminRoutes().length).toBeGreaterThan(0);
  });

  it('SEMUA route /admin menolak anonymous (401) dan customer (403)', async () => {
    const customer = await loginAndroid(app);
    for (const r of adminRoutes()) {
      const anon = await (api() as any)[r.method](r.path);
      expect({ route: `${r.method} ${r.path}`, status: anon.status }).toEqual({ route: `${r.method} ${r.path}`, status: 401 });
      const cust = await (api() as any)[r.method](r.path).set('Authorization', `Bearer ${customer.accessToken}`);
      expect({ route: `${r.method} ${r.path}`, status: cust.status }).toEqual({ route: `${r.method} ${r.path}`, status: 403 });
    }
  });

  it('Hari diprovisioning via CLI, lalu login Google → role ADMIN dan bisa akses /admin', async () => {
    provision('--email Hari.Admin@Example.com');
    const res = await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('hari-google-sub', 'hari.admin@example.com', 'Hari Susanto'), client: 'android' })
      .expect(200);
    expect(res.body.user.role).toBe('ADMIN');

    const audit = await api().get('/api/v1/admin/audit-logs').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    expect(audit.body.items.some((a: { action: string }) => a.action === 'ADMIN_PROVISIONED')).toBe(true);

    // Admin tidak bisa memakai endpoint khusus customer
    await api().get('/api/v1/me/profile').set('Authorization', `Bearer ${res.body.accessToken}`).expect(403);
  });

  it('tidak ada jalur publik menjadi admin: Google login biasa selalu CUSTOMER', async () => {
    const u = await loginAndroid(app, 'random-sub', 'someone@example.com');
    expect(u.user.role).toBe('CUSTOMER');
  });

  it('provisioning admin kedua ditolak tanpa --replace; database juga menolak dua admin aktif', async () => {
    provision('--email first.admin@example.com');
    expect(() => provision('--email second.admin@example.com')).toThrow();
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);

    await expect(prisma.user.create({ data: { email: 'rogue@example.com', name: 'Rogue', role: 'ADMIN' } })).rejects.toThrow();
  });

  it('--replace mencabut admin lama beserta sesinya', async () => {
    provision('--email old.admin@example.com');
    const old = await api()
      .post('/api/v1/auth/google')
      .set('X-Forwarded-For', freshIp())
      .send({ idToken: fakeIdToken('old-sub', 'old.admin@example.com'), client: 'android' })
      .expect(200);
    provision('--email new.admin@example.com --replace');
    await api().get('/api/v1/admin/audit-logs').set('Authorization', `Bearer ${old.body.accessToken}`).expect(401);
    const oldUser = await prisma.user.findUniqueOrThrow({ where: { email: 'old.admin@example.com' } });
    expect(oldUser.role).toBe('CUSTOMER');
  });

  it('customer yang dipromosikan harus login ulang (token lama ber-role CUSTOMER dicabut)', async () => {
    const c = await loginAndroid(app, 'promo-sub', 'promo@example.com');
    provision('--email promo@example.com');
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${c.accessToken}`).expect(401);
  });

  it('customer hanya bisa mengubah profilnya sendiri; validasi nomor WhatsApp', async () => {
    const c = await loginAndroid(app);
    await api().patch('/api/v1/me/profile').set('Authorization', `Bearer ${c.accessToken}`).send({ whatsapp: '12345' }).expect(400);
    const ok = await api()
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${c.accessToken}`)
      .send({ whatsapp: '0812-3456-7890'.replace(/-/g, ''), city: 'Jakarta' })
      .expect(200);
    expect(ok.body.whatsapp).toBe('+6281234567890');
    // Tidak bisa menyisipkan field lain (mis. role / userId)
    await api().patch('/api/v1/me/profile').set('Authorization', `Bearer ${c.accessToken}`).send({ role: 'ADMIN' }).expect(400);
  });

  it('endpoint publik dapat diakses tanpa login', async () => {
    await api().get('/api/v1/health').expect(200);
    const profile = await api().get('/api/v1/mc-profile').expect(200);
    expect(profile.body.displayName).toBe('Hari Susanto');
    expect(profile.body.singleton).toBeUndefined();
    const services = await api().get('/api/v1/services').expect(200);
    expect(services.body).toHaveLength(7);
  });
});
