import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, loginAndroid, resetDb } from './utils';

/** Tanggal (WIB) N hari dari sekarang, format YYYY-MM-DD. */
function futureDate(days: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

describe('Bookings (customer)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let serviceId: string;
  let otherServiceId: string;
  const api = () => request(app.getHttpServer());

  const validBody = (over: Record<string, unknown> = {}) => ({
    contactName: 'Budi Santoso',
    contactEmail: 'budi@example.com',
    contactWhatsapp: '0812-3456-7890',
    eventName: 'Ulang Tahun Alya ke-7',
    serviceId,
    eventDate: futureDate(30),
    startTime: '10:00',
    endTime: '12:00',
    timezone: 'Asia/Jakarta',
    venueName: 'Rumah Keluarga',
    address: 'Jl. Contoh No. 1, Gambir',
    city: 'Jakarta Pusat',
    guestCount: 40,
    language: 'Bahasa Indonesia',
    privacyConsent: true,
    dataConfirmed: true,
    ...over,
  });

  const submit = (token: string, body: Record<string, unknown>, key: string = randomUUID()) =>
    api().post('/api/v1/bookings').set('X-Forwarded-For', freshIp()).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    serviceId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'ulang-tahun-anak' } })).id;
    otherServiceId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'gathering' } })).id;
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  describe('akses', () => {
    it('anonymous ditolak (401), admin tidak bisa membuat booking customer (403)', async () => {
      await api().post('/api/v1/bookings').send(validBody()).expect(401);
      await prisma.user.create({ data: { email: 'hari@example.com', name: 'Hari Susanto', role: 'ADMIN', adminProfile: { create: { displayName: 'Hari' } } } });
      const admin = await api()
        .post('/api/v1/auth/google')
        .set('X-Forwarded-For', freshIp())
        .send({ idToken: fakeIdToken('hari-sub', 'hari@example.com'), client: 'android' })
        .expect(200);
      await submit(admin.body.accessToken, validBody()).expect(403);
    });

    it('Idempotency-Key wajib berupa UUID', async () => {
      const c = await loginAndroid(app);
      await api().post('/api/v1/bookings').set('Authorization', `Bearer ${c.accessToken}`).send(validBody()).expect(400);
      await submit(c.accessToken, validBody(), 'bukan-uuid').expect(400);
    });
  });

  describe('submit', () => {
    it('booking tersimpan lengkap: kode unik, PENDING, detail acara, log, audit, notifikasi', async () => {
      await prisma.user.create({ data: { email: 'hari@example.com', name: 'Hari Susanto', role: 'ADMIN' } });
      const c = await loginAndroid(app);
      const res = await submit(c.accessToken, validBody()).expect(201);
      const b = res.body;

      expect(b.code).toMatch(/^HMC-\d{6}-[0-9A-Z]{5}$/);
      expect(b.status).toBe('PENDING');
      expect(b.allowedActions).toEqual(['CANCEL']);
      expect(b.contact.whatsapp).toBe('+6281234567890');
      expect(b.event.eventName).toBe('Ulang Tahun Alya ke-7');
      expect(b.pricing.hasPrice).toBe(false); // tanpa paket → tidak mengarang harga
      expect(new Date(b.schedule.start).toISOString()).toBe(`${futureDate(30)}T03:00:00.000Z`); // 10:00 WIB
      expect(b.timeline).toHaveLength(1);
      expect(b.timeline[0]).toMatchObject({ toStatus: 'PENDING', action: 'SUBMIT', actorType: 'CUSTOMER' });

      expect(await prisma.eventDetail.count({ where: { bookingId: b.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'BOOKING_SUBMIT', entityId: b.id } })).toBe(1);
      const notifs = await prisma.notification.findMany({ where: { data: { path: ['bookingId'], equals: b.id } } });
      expect(notifs.map((n) => n.type).sort()).toEqual(['ADMIN_NEW_BOOKING', 'BOOKING_SUBMITTED']);

      // Profil customer terisi otomatis untuk autofill berikutnya
      const profile = await prisma.customerProfile.findUniqueOrThrow({ where: { userId: c.user.id } });
      expect(profile.whatsapp).toBe('+6281234567890');
    });

    it('double submission (klik berulang, key sama) → satu booking; replay mengembalikan booking yang sama', async () => {
      const c = await loginAndroid(app);
      const key = randomUUID();
      const first = await submit(c.accessToken, validBody(), key).expect(201);
      const again = await submit(c.accessToken, validBody(), key).expect(200);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect(again.body.id).toBe(first.body.id);
      expect(await prisma.booking.count()).toBe(1);
    });

    it('double submission paralel (5 request bersamaan, key sama) → tepat satu booking', async () => {
      const c = await loginAndroid(app);
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 5 }, () => submit(c.accessToken, validBody(), key)));
      expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.booking.count()).toBe(1);
      expect(await prisma.notification.count({ where: { type: 'BOOKING_SUBMITTED' } })).toBe(1);
    });

    it('key berbeda → pesanan baru (pelanggan boleh memesan lagi)', async () => {
      const c = await loginAndroid(app);
      await submit(c.accessToken, validBody()).expect(201);
      await submit(c.accessToken, validBody({ eventName: 'Acara kedua' })).expect(201);
      expect(await prisma.booking.count()).toBe(2);
    });
  });

  describe('validasi', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['tanggal lampau', { eventDate: '2020-01-01' }, 'eventDate'],
      ['kurang dari 24 jam sebelum acara', { eventDate: futureDate(0), startTime: '23:30', endTime: '23:59' }, 'eventDate'],
      ['jam selesai sebelum jam mulai', { startTime: '12:00', endTime: '10:00' }, 'endTime'],
      ['tanggal tidak ada', { eventDate: '2027-02-30' }, 'eventDate'],
    ];
    it.each(cases)('jadwal: %s', async (_name, over, field) => {
      const c = await loginAndroid(app);
      const res = await submit(c.accessToken, validBody(over)).expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
      expect(await prisma.booking.count()).toBe(0);
    });

    it.each([
      ['WhatsApp tidak valid', { contactWhatsapp: '12345' }],
      ['email tidak valid', { contactEmail: 'bukan-email' }],
      ['zona waktu asing', { timezone: 'Europe/London' }],
      ['link maps javascript:', { mapsUrl: 'javascript:alert(1)' }],
      ['tanpa persetujuan privasi', { privacyConsent: false }],
      ['tanpa konfirmasi data', { dataConfirmed: false }],
      ['field asing (mass assignment)', { status: 'CONFIRMED' }],
      ['field asing totalAmount', { totalAmount: 1 }],
      ['nama acara kosong', { eventName: '' }],
    ])('DTO: %s → 400', async (_name, over) => {
      const c = await loginAndroid(app);
      await submit(c.accessToken, validBody(over)).expect(400);
      expect(await prisma.booking.count()).toBe(0);
    });

    it('kategori tidak dikenal / nonaktif ditolak', async () => {
      const c = await loginAndroid(app);
      await submit(c.accessToken, validBody({ serviceId: randomUUID() })).expect(400);
      await prisma.service.update({ where: { id: otherServiceId }, data: { isActive: false } });
      await submit(c.accessToken, validBody({ serviceId: otherServiceId })).expect(400);
      await prisma.service.update({ where: { id: otherServiceId }, data: { isActive: true } });
    });
  });

  describe('paket & snapshot harga', () => {
    it('harga paket disalin saat booking dan tidak berubah saat paket diubah', async () => {
      const pkg = await prisma.servicePackage.create({ data: { serviceId, name: 'Paket Uji', durationMinutes: 120, price: 1_500_000 } });
      const c = await loginAndroid(app);
      const res = await submit(c.accessToken, validBody({ packageId: pkg.id })).expect(201);
      expect(res.body.pricing).toMatchObject({ packageName: 'Paket Uji', hasPrice: true });
      expect(Number(res.body.pricing.totalAmount)).toBe(1_500_000);

      await prisma.servicePackage.update({ where: { id: pkg.id }, data: { price: 2_000_000, name: 'Diubah' } });
      const after = await api().get(`/api/v1/bookings/${res.body.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(Number(after.body.pricing.packagePrice)).toBe(1_500_000);
      expect(after.body.pricing.packageName).toBe('Paket Uji');
    });

    it('paket milik kategori lain atau nonaktif ditolak', async () => {
      const other = await prisma.servicePackage.create({ data: { serviceId: otherServiceId, name: 'Gathering', durationMinutes: 60, price: 1 } });
      const inactive = await prisma.servicePackage.create({ data: { serviceId, name: 'Off', durationMinutes: 60, price: 1, isActive: false } });
      const c = await loginAndroid(app);
      await submit(c.accessToken, validBody({ packageId: other.id })).expect(400);
      await submit(c.accessToken, validBody({ packageId: inactive.id })).expect(400);
    });
  });

  describe('form configurable', () => {
    it('pertanyaan tambahan & field wajib dari settings divalidasi dan disimpan', async () => {
      const row = await prisma.businessSetting.findUniqueOrThrow({ where: { key: 'booking_form' } });
      const original = row.value as Record<string, any>;
      const modified = structuredClone(original);
      modified.extraQuestions = [{ key: 'source', label: 'Tahu dari mana?', type: 'select', options: ['Instagram', 'Teman'], required: true }];
      for (const s of modified.sections) for (const f of s.fields) if (f.key === 'dressCode') f.required = true;
      await prisma.businessSetting.update({ where: { key: 'booking_form' }, data: { value: modified } });
      try {
        const c = await loginAndroid(app);
        const bad = await submit(c.accessToken, validBody()).expect(400);
        expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['dressCode', 'formAnswers.source']);
        await submit(c.accessToken, validBody({ dressCode: 'Batik', formAnswers: { source: 'Instagram', hack: 1 } })).expect(400);

        const ok = await submit(c.accessToken, validBody({ dressCode: 'Batik', formAnswers: { source: 'Instagram' } })).expect(201);
        expect(ok.body.formAnswers).toEqual({ source: 'Instagram' });
      } finally {
        await prisma.businessSetting.update({ where: { key: 'booking_form' }, data: { value: original } });
      }
    });
  });

  describe('jadwal Hari', () => {
    async function blockSlot(start: string, end: string) {
      const other = await prisma.user.create({ data: { email: `other-${randomUUID().slice(0, 6)}@example.com`, name: 'Lain' } });
      const d = futureDate(30);
      await prisma.booking.create({
        data: {
          code: `HMC-T-${randomUUID().slice(0, 6)}`,
          customerId: other.id,
          serviceId,
          status: 'CONFIRMED',
          idempotencyKey: randomUUID(),
          eventStartAt: new Date(`${d}T${start}:00+07:00`),
          eventEndAt: new Date(`${d}T${end}:00+07:00`),
          contactName: 'Lain',
          contactEmail: 'lain@example.com',
          contactWhatsapp: '+628111',
          privacyConsentAt: new Date(),
        },
      });
    }

    it('slot yang sudah terkonfirmasi ditolak (409) tanpa membocorkan data pelanggan lain', async () => {
      await blockSlot('11:00', '13:00');
      const c = await loginAndroid(app);
      const res = await submit(c.accessToken, validBody()).expect(409);
      expect(res.body.code).toBe('SLOT_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/Lain|lain@example/);
    });

    it('jeda perjalanan 60 menit diperhitungkan', async () => {
      await blockSlot('07:00', '09:30'); // selesai 09:30, booking mulai 10:00 → dalam buffer
      const c = await loginAndroid(app);
      await submit(c.accessToken, validBody()).expect(409);
      await submit(c.accessToken, validBody({ startTime: '10:30', endTime: '12:00' })).expect(201); // tepat 60 menit
    });

    it('booking PENDING orang lain tidak mengunci slot', async () => {
      const a = await loginAndroid(app);
      const b = await loginAndroid(app);
      await submit(a.accessToken, validBody()).expect(201);
      await submit(b.accessToken, validBody()).expect(201);
    });
  });

  describe('kepemilikan data', () => {
    it('pelanggan lain tidak bisa melihat, mendaftar, atau membatalkan booking orang lain', async () => {
      const owner = await loginAndroid(app);
      const intruder = await loginAndroid(app);
      const b = (await submit(owner.accessToken, validBody()).expect(201)).body;

      await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${intruder.accessToken}`).expect(404);
      await api().post(`/api/v1/bookings/${b.id}/cancel`).set('Authorization', `Bearer ${intruder.accessToken}`).send({ reason: 'iseng saja' }).expect(404);
      const list = await api().get('/api/v1/bookings').set('Authorization', `Bearer ${intruder.accessToken}`).expect(200);
      expect(list.body.total).toBe(0);
      const summary = await api().get('/api/v1/bookings/summary').set('Authorization', `Bearer ${intruder.accessToken}`).expect(200);
      expect(summary.body.total).toBe(0);

      expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PENDING');
      await api().get('/api/v1/bookings/bukan-uuid').set('Authorization', `Bearer ${owner.accessToken}`).expect(400);
    });

    it('notifikasi orang lain tidak bisa ditandai dibaca', async () => {
      const owner = await loginAndroid(app);
      const intruder = await loginAndroid(app);
      await submit(owner.accessToken, validBody()).expect(201);
      const n = await prisma.notification.findFirstOrThrow({ where: { userId: owner.user.id } });
      await api().post(`/api/v1/notifications/${n.id}/read`).set('Authorization', `Bearer ${intruder.accessToken}`).expect(404);
      const mine = await api().get('/api/v1/notifications').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
      expect(mine.body.unread).toBe(1);
      await api().post(`/api/v1/notifications/${n.id}/read`).set('Authorization', `Bearer ${owner.accessToken}`).expect(204);
      const after = await api().get('/api/v1/notifications').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
      expect(after.body.unread).toBe(0);
    });
  });

  describe('riwayat, ringkasan, dan pembatalan', () => {
    it('daftar upcoming/past dan ringkasan dashboard', async () => {
      const c = await loginAndroid(app);
      const soon = (await submit(c.accessToken, validBody({ eventDate: futureDate(10) })).expect(201)).body;
      const later = (await submit(c.accessToken, validBody({ eventDate: futureDate(40) })).expect(201)).body;
      const cancelled = (await submit(c.accessToken, validBody({ eventDate: futureDate(50) })).expect(201)).body;
      await api().post(`/api/v1/bookings/${cancelled.id}/cancel`).set('Authorization', `Bearer ${c.accessToken}`).send({ reason: 'Acara diundur' }).expect(200);

      const auth = { Authorization: `Bearer ${c.accessToken}` };
      const upcoming = await api().get('/api/v1/bookings?scope=upcoming').set(auth).expect(200);
      expect(upcoming.body.items.map((b: { id: string }) => b.id)).toEqual([soon.id, later.id]);
      const past = await api().get('/api/v1/bookings?scope=past').set(auth).expect(200);
      expect(past.body.items.map((b: { id: string }) => b.id)).toEqual([cancelled.id]);
      const all = await api().get('/api/v1/bookings?pageSize=2').set(auth).expect(200);
      expect(all.body.total).toBe(3);
      expect(all.body.items).toHaveLength(2);

      const summary = await api().get('/api/v1/bookings/summary').set(auth).expect(200);
      expect(summary.body).toMatchObject({ total: 3, active: 2, cancelled: 1, completed: 0 });
      expect(summary.body.nextEvent.id).toBe(soon.id);
    });

    it('pembatalan oleh pelanggan tercatat di timeline; tidak bisa dibatalkan dua kali', async () => {
      const c = await loginAndroid(app);
      const b = (await submit(c.accessToken, validBody()).expect(201)).body;
      const res = await api().post(`/api/v1/bookings/${b.id}/cancel`).set('Authorization', `Bearer ${c.accessToken}`).send({ reason: 'Acara dibatalkan keluarga' }).expect(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.allowedActions).toEqual([]);
      expect(res.body.timeline.map((t: { toStatus: string }) => t.toStatus)).toEqual(['PENDING', 'CANCELLED']);
      expect(res.body.timeline[1].note).toBe('Acara dibatalkan keluarga');
      await api().post(`/api/v1/bookings/${b.id}/cancel`).set('Authorization', `Bearer ${c.accessToken}`).send({ reason: 'lagi lagi' }).expect(409);
    });

    it('pesanan CONFIRMED tidak bisa dibatalkan sendiri oleh pelanggan', async () => {
      const c = await loginAndroid(app);
      const b = (await submit(c.accessToken, validBody()).expect(201)).body;
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
      await api().post(`/api/v1/bookings/${b.id}/cancel`).set('Authorization', `Bearer ${c.accessToken}`).send({ reason: 'ingin batal' }).expect(409);
    });
  });

  describe('data publik', () => {
    it('/site hanya berisi data nyata: tanpa rating/ulasan buatan', async () => {
      const res = await api().get('/api/v1/site').expect(200);
      expect(res.body.profile.displayName).toBe('Hari Susanto');
      expect(res.body.services).toHaveLength(7);
      expect(res.body.faq.length).toBeGreaterThan(0);
      expect(res.body.reviews).toEqual({ source: 'google', integrationActive: false, mapsUrl: 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9' });
      expect(JSON.stringify(res.body)).not.toMatch(/"rating"|"reviewCount"|"testimonial"/i);
    });

    it('/booking-form mengembalikan konfigurasi yang belum diverifikasi + zona waktu Indonesia', async () => {
      const res = await api().get('/api/v1/booking-form').expect(200);
      expect(res.body.form.verifiedAgainstOriginalForm).toBe(false);
      expect(res.body.timezones.map((t: { id: string }) => t.id)).toEqual(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']);
      expect(res.body.rules).toEqual({ minLeadTimeHours: 24, maxAdvanceDays: 365 });
    });
  });
});

describe('Dev login', () => {
  it('nonaktif secara default: endpoint 404 dan config melaporkan false', async () => {
    const app = await createTestApp();
    try {
      const cfg = await request(app.getHttpServer()).get('/api/v1/auth/config').expect(200);
      expect(cfg.body).toEqual({ googleClientId: 'test-web-client.apps.googleusercontent.com', devLoginEnabled: false, devAdminLoginEnabled: false, emailLoginEnabled: true, emailDevMailbox: true });
      await request(app.getHttpServer()).post('/api/v1/auth/dev-login').send({ email: 'a@example.com', name: 'A' }).expect(404);
    } finally {
      await app.close();
    }
  });

  it('jika aktif: hanya customer baru/dev; tidak bisa masuk sebagai admin atau akun Google', async () => {
    const app = await createTestApp({ ENABLE_DEV_LOGIN: 'true' });
    const prisma = app.get(PrismaService);
    const api = () => request(app.getHttpServer()).post('/api/v1/auth/dev-login').set('X-Forwarded-For', freshIp());
    try {
      await resetDb(prisma);
      const ok = await api().send({ email: 'Dev.User@Example.com', name: 'Dev User', client: 'android' }).expect(200);
      expect(ok.body.user).toMatchObject({ role: 'CUSTOMER', email: 'dev.user@example.com' });

      await prisma.user.create({ data: { email: 'hari@example.com', name: 'Hari', role: 'ADMIN' } });
      await api().send({ email: 'hari@example.com', name: 'Hari' }).expect(403);

      await loginAndroid(app, 'real-google-sub', 'real@example.com');
      await api().send({ email: 'real@example.com', name: 'Penyusup' }).expect(403);
      await api().send({ email: 'x@example.com', name: 'X', role: 'ADMIN' }).expect(400);
    } finally {
      await app.close();
    }
  });
});
