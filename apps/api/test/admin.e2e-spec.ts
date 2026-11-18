import { INestApplication } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, loginAndroid, resetDb } from './utils';

function futureDate(days: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`);
const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a59f0000000049454e44ae426082', 'hex');

describe('Admin CMS API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let serviceId: string;
  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${admin}`).set('X-Forwarded-For', freshIp());

  async function loginAdmin() {
    await prisma.user.create({ data: { email: 'admin.test@example.com', name: 'Hari Susanto', role: 'ADMIN', adminProfile: { create: { displayName: 'Hari Susanto' } } } });
    const res = await api().post('/api/v1/auth/google').set('X-Forwarded-For', freshIp()).send({ idToken: fakeIdToken('admin-sub', 'admin.test@example.com', 'Hari Susanto'), client: 'android' }).expect(200);
    expect(res.body.user.role).toBe('ADMIN');
    return res.body.accessToken as string;
  }

  /** Booking lewat API customer (alur nyata). */
  async function customerBooking(token: string, over: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', freshIp())
      .send({
        contactName: 'Budi Santoso',
        contactEmail: 'budi@example.com',
        contactWhatsapp: '081234567890',
        eventName: 'Ulang Tahun Alya',
        serviceId,
        eventDate: futureDate(30),
        startTime: '10:00',
        endTime: '12:00',
        timezone: 'Asia/Jakarta',
        venueName: 'Rumah',
        address: 'Jl. Contoh No. 1',
        city: 'Jakarta Pusat',
        privacyConsent: true,
        dataConfirmed: true,
        ...over,
      });
    expect(res.status).toBe(201);
    return res.body as { id: string; code: string };
  }

  /** Booking langsung di DB (untuk menyiapkan status tertentu). */
  async function dbBooking(status: BookingStatus, date: string, start: string, end: string, customerId?: string) {
    const cid = customerId ?? (await prisma.user.create({ data: { email: `c-${randomUUID().slice(0, 8)}@example.com`, name: 'Pelanggan Lain' } })).id;
    return prisma.booking.create({
      data: {
        code: `HMC-T-${randomUUID().slice(0, 6)}`,
        customerId: cid,
        serviceId,
        status,
        idempotencyKey: randomUUID(),
        eventStartAt: wib(date, start),
        eventEndAt: wib(date, end),
        contactName: 'Pelanggan Lain',
        contactEmail: 'lain@example.com',
        contactWhatsapp: '+628111',
        privacyConsentAt: new Date(),
        eventDetail: { create: { eventName: 'Acara Lain', venueName: 'Gedung', address: 'Jl. Lain', city: 'Bekasi' } },
      },
    });
  }

  const transition = (id: string, toStatus: BookingStatus, extra: Record<string, unknown> = {}) =>
    asAdmin(api().post(`/api/v1/admin/bookings/${id}/transition`)).send({ toStatus, ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    serviceId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'ulang-tahun-anak' } })).id;
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.portfolio.deleteMany();
    admin = await loginAdmin();
  });
  afterAll(() => app.close());

  describe('otorisasi', () => {
    it('customer tidak bisa mengubah status booking miliknya sendiri lewat endpoint admin', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await api().post(`/api/v1/admin/bookings/${b.id}/transition`).set('Authorization', `Bearer ${c.accessToken}`).send({ toStatus: 'ACCEPTED' }).expect(403);
      await api().patch(`/api/v1/admin/bookings/${b.id}/pricing`).set('Authorization', `Bearer ${c.accessToken}`).send({}).expect(403);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PENDING');
    });

    it('admin yang di-suspend langsung kehilangan akses CMS', async () => {
      await prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { status: 'SUSPENDED' } });
      await asAdmin(api().get('/api/v1/admin/dashboard')).expect(401);
    });
  });

  describe('dashboard', () => {
    it('semua angka sesuai isi database', async () => {
      const c = await loginAndroid(app);
      await customerBooking(c.accessToken);
      await customerBooking(c.accessToken, { eventDate: futureDate(31) });
      await dbBooking('CONFIRMED', futureDate(40), '10:00', '12:00');
      await dbBooking('COMPLETED', futureDate(41), '10:00', '12:00');
      await dbBooking('WAITING_PAYMENT', futureDate(42), '10:00', '12:00');

      const res = await asAdmin(api().get('/api/v1/admin/dashboard')).expect(200);
      expect(res.body.counts.total).toBe(5);
      expect(res.body.counts.byStatus).toMatchObject({ PENDING: 2, CONFIRMED: 1, COMPLETED: 1, WAITING_PAYMENT: 1, ACCEPTED: 0 });
      expect(res.body.counts.upcoming).toBe(2); // CONFIRMED + WAITING_PAYMENT (mengunci jadwal)
      expect(res.body.recent).toHaveLength(5);
      expect(res.body.notifications.items.some((n: { type: string }) => n.type === 'ADMIN_NEW_BOOKING')).toBe(true);
    });

    it('menghitung booking PENDING yang bentrok dengan jadwal terkunci', async () => {
      const c = await loginAndroid(app);
      await customerBooking(c.accessToken); // 10:00–12:00 hari +30
      await dbBooking('CONFIRMED', futureDate(30), '12:30', '14:00'); // dalam jeda 60 menit
      const res = await asAdmin(api().get('/api/v1/admin/dashboard')).expect(200);
      expect(res.body.counts.pendingWithConflict).toBe(1);
    });
  });

  describe('daftar booking: pencarian & filter', () => {
    it('cari nama/nomor/WA, filter status, kategori, tanggal, paginasi, dan jumlah per status', async () => {
      const c = await loginAndroid(app);
      const a = await customerBooking(c.accessToken, { contactName: 'Siti Aminah', eventDate: futureDate(20) });
      await customerBooking(c.accessToken, { contactName: 'Joko Widodo', eventDate: futureDate(50), contactWhatsapp: '085711112222' });
      const gathering = (await prisma.service.findUniqueOrThrow({ where: { slug: 'gathering' } })).id;
      await customerBooking(c.accessToken, { contactName: 'Rina', serviceId: gathering, eventDate: futureDate(25) });
      await dbBooking('CONFIRMED', futureDate(60), '10:00', '12:00');

      const get = (qs: string) => asAdmin(api().get(`/api/v1/admin/bookings?${qs}`)).expect(200).then((r) => r.body);
      expect((await get('q=siti')).items.map((i: { id: string }) => i.id)).toEqual([a.id]);
      expect((await get(`q=${a.code.toLowerCase()}`)).total).toBe(1);
      expect((await get('q=0857-1111')).items[0].contactName).toBe('Joko Widodo');
      expect((await get('status=CONFIRMED')).total).toBe(1);
      expect((await get('status=PENDING,CONFIRMED')).total).toBe(4);
      expect((await get(`serviceId=${gathering}`)).items[0].contactName).toBe('Rina');
      expect((await get(`dateFrom=${futureDate(19)}&dateTo=${futureDate(26)}`)).total).toBe(2);
      const page = await get('pageSize=2&page=2&sort=event_asc');
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(4);
      expect((await get('q=siti')).statusCounts).toMatchObject({ PENDING: 1, CONFIRMED: 0 });
      await asAdmin(api().get('/api/v1/admin/bookings?status=BUKAN_STATUS')).expect(400);
      await asAdmin(api().get('/api/v1/admin/bookings?dateFrom=2027-02-30')).expect(400);
    });
  });

  describe('transisi status', () => {
    it('alur lengkap PENDING → … → COMPLETED: timestamp, log, audit, notifikasi pelanggan', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);

      let r = await transition(b.id, 'ACCEPTED', { expectedStatus: 'PENDING', note: 'Siap memandu' }).expect(200);
      expect(r.body.status).toBe('ACCEPTED');
      await transition(b.id, 'WAITING_PAYMENT').expect(409); // harga belum ditetapkan
      await asAdmin(api().patch(`/api/v1/admin/bookings/${b.id}/pricing`))
        .send({ packagePrice: 1_500_000, transportFee: 200_000, additionalFee: 0, discountAmount: 100_000, depositAmount: 800_000 })
        .expect(200);
      r = await transition(b.id, 'WAITING_PAYMENT').expect(200);
      expect(Number(r.body.pricing.totalAmount)).toBe(1_600_000);
      // Tanpa pembayaran terverifikasi, konfirmasi ditolak (anomali yang diperbaiki)
      expect((await transition(b.id, 'CONFIRMED').expect(409)).body.code).toBe('PAYMENT_NOT_VERIFIED');
      // Hari mencatat DP yang diterima → otomatis terkonfirmasi
      await asAdmin(api().post(`/api/v1/admin/bookings/${b.id}/payments`)).send({ amount: 800_000, method: 'BANK_TRANSFER', paidAt: new Date().toISOString() }).expect(201);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED');
      await transition(b.id, 'IN_PROGRESS').expect(200);
      r = await transition(b.id, 'COMPLETED').expect(200);

      expect(r.body.timeline.map((t: { toStatus: string }) => t.toStatus)).toEqual(['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);
      expect(r.body.timeline[1]).toMatchObject({ actorType: 'ADMIN', actorName: 'Hari Susanto', note: 'Siap memandu' });
      expect(r.body.allowedTransitions).toEqual([]);

      const db = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
      for (const f of ['acceptedAt', 'confirmedAt', 'startedAt', 'completedAt'] as const) expect(db[f]).toBeInstanceOf(Date);

      const audits = (await prisma.auditLog.findMany({ where: { entityId: b.id, actorType: 'ADMIN' }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
      expect(audits).toEqual(['BOOKING_ACCEPT', 'BOOKING_PRICING_UPDATE', 'BOOKING_REQUEST_PAYMENT', 'BOOKING_CONFIRM_PAYMENT', 'BOOKING_START_EVENT', 'BOOKING_COMPLETE_EVENT']);

      const notifTypes = (await prisma.notification.findMany({ where: { userId: c.user.id } })).map((n) => n.type).sort();
      expect(notifTypes).toEqual(['BOOKING_ACCEPTED', 'BOOKING_COMPLETED', 'BOOKING_CONFIRMED', 'BOOKING_IN_PROGRESS', 'BOOKING_PRICING_UPDATED', 'BOOKING_SUBMITTED', 'BOOKING_WAITING_PAYMENT'].sort());

      // Pelanggan melihat perkembangan yang sama
      const mine = await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(mine.body.status).toBe('COMPLETED');
    });

    it('transisi yang tidak diizinkan ditolak; status final terkunci', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await transition(b.id, 'CONFIRMED').expect(409);
      await transition(b.id, 'COMPLETED').expect(409);
      await transition(b.id, 'PENDING').expect(409);
      await transition(b.id, 'BUKAN' as BookingStatus).expect(400);
      await transition(b.id, 'REJECTED', { note: 'Jadwal penuh di hari tersebut' }).expect(200);
      await transition(b.id, 'ACCEPTED').expect(409);
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('REJECTED');
    });

    it('menolak & membatalkan wajib dengan alasan; alasan tersimpan dan terlihat pelanggan', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await transition(b.id, 'REJECTED').expect(400);
      await transition(b.id, 'REJECTED', { note: 'abc' }).expect(400);
      await transition(b.id, 'REJECTED', { note: 'Sudah ada acara lain di tanggal ini' }).expect(200);
      const mine = await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(mine.body.rejectionReason).toBe('Sudah ada acara lain di tanggal ini');
      expect(mine.body.status).toBe('REJECTED');
    });

    it('expectedStatus basi → 409 (mencegah aksi atas tampilan lama)', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await transition(b.id, 'ACCEPTED', { expectedStatus: 'WAITING_PAYMENT' }).expect(409);
    });

    it('refund hanya jika ada pembayaran terverifikasi', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await transition(b.id, 'CANCELLED', { note: 'Dibatalkan atas permintaan' }).expect(200);
      const r = await transition(b.id, 'REFUNDED').expect(409);
      expect(r.body.code).toBe('NO_VERIFIED_PAYMENT');
      await prisma.payment.create({ data: { code: 'PAY-T-1', bookingId: b.id, type: 'DOWN_PAYMENT', method: 'BANK_TRANSFER', amount: 500_000, paidAt: new Date(), status: 'VERIFIED' } });
      await transition(b.id, 'REFUNDED').expect(200);
      // Riwayat pembayaran tidak terhapus
      expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(1);
    });

    it('booking yang tidak ada → 404; id bukan UUID → 400', async () => {
      await transition(randomUUID(), 'ACCEPTED').expect(404);
      await asAdmin(api().get('/api/v1/admin/bookings/bukan-uuid')).expect(400);
    });
  });

  describe('aturan jadwal tidak bisa di-bypass', () => {
    it('menerima booking yang bentrok dengan jadwal terkunci → 409 SLOT_CONFLICT', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken); // 10–12
      await dbBooking('CONFIRMED', futureDate(30), '11:00', '13:00');
      const r = await transition(b.id, 'ACCEPTED').expect(409);
      expect(r.body.code).toBe('SLOT_CONFLICT');
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PENDING');
    });

    it('jeda perjalanan dihormati: selesai 09:30, mulai 10:00 → ditolak', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await dbBooking('ACCEPTED', futureDate(30), '07:00', '09:30');
      expect((await transition(b.id, 'ACCEPTED').expect(409)).body.code).toBe('SLOT_CONFLICT');
    });

    it('detail booking menampilkan konflik dengan booking lain', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      const other = await dbBooking('CONFIRMED', futureDate(30), '12:30', '14:00');
      const d = await asAdmin(api().get(`/api/v1/admin/bookings/${b.id}`)).expect(200);
      expect(d.body.conflicts).toEqual([expect.objectContaining({ id: other.id, blocking: true, type: 'BUFFER' })]);
      expect(d.body.customer).toMatchObject({ name: expect.any(String), whatsapp: '+6281234567890' });
      expect(d.body.attachments).toEqual([]);
    });

    it('konkuren: 5 booking PENDING berdekatan (hanya bentrok lewat jeda) diterima bersamaan → tepat 1 berhasil', async () => {
      const c = await loginAndroid(app);
      const date = futureDate(33);
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        // Slot tidak saling tumpang tindih (exclusion constraint DB tidak akan menolak), tapi jaraknya < 60 menit
        const start = `${String(8 + i * 2).padStart(2, '0')}:00`;
        const end = `${String(9 + i * 2).padStart(2, '0')}:30`;
        ids.push((await customerBooking(c.accessToken, { eventDate: date, startTime: start, endTime: end })).id);
      }
      const results = await Promise.all(ids.map((id) => transition(id, 'ACCEPTED')));
      const ok = results.filter((r) => r.status === 200);
      // 08:00–09:30, 10:00–11:30, 12:00–13:30 … setiap pasangan bertetangga berjarak 30 menit (< 60) → maksimal yang tidak bentrok: index 0, 2, 4
      expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
      const accepted = await prisma.booking.findMany({ where: { id: { in: ids }, status: 'ACCEPTED' }, orderBy: { eventStartAt: 'asc' } });
      for (let i = 1; i < accepted.length; i++) {
        expect(+accepted[i].eventStartAt - +accepted[i - 1].eventEndAt).toBeGreaterThanOrEqual(60 * 60_000);
      }
      expect(ok.length).toBe(accepted.length);
      expect(ok.length).toBeGreaterThanOrEqual(1);
    });

    it('konkuren: 6 booking di slot yang sama diterima bersamaan → tepat 1', async () => {
      const c = await loginAndroid(app);
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push((await customerBooking(c.accessToken, { eventDate: futureDate(34) })).id);
      const results = await Promise.all(ids.map((id) => transition(id, 'ACCEPTED')));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await prisma.booking.count({ where: { id: { in: ids }, status: 'ACCEPTED' } })).toBe(1);
    });
  });

  describe('minta perubahan & rincian biaya', () => {
    it('minta perubahan: status tetap, tercatat di timeline, pelanggan mendapat notifikasi', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await asAdmin(api().post(`/api/v1/admin/bookings/${b.id}/request-changes`)).send({ message: 'x' }).expect(400);
      const r = await asAdmin(api().post(`/api/v1/admin/bookings/${b.id}/request-changes`)).send({ message: 'Mohon kirim rundown lengkap' }).expect(200);
      expect(r.body.status).toBe('PENDING');
      expect(r.body.timeline.at(-1)).toMatchObject({ action: 'REQUEST_CHANGES', note: 'Mohon kirim rundown lengkap' });
      const n = await prisma.notification.findFirst({ where: { userId: c.user.id, type: 'BOOKING_CHANGES_REQUESTED' } });
      expect(n?.body).toContain('Mohon kirim rundown lengkap');
      expect(await prisma.auditLog.count({ where: { action: 'BOOKING_REQUEST_CHANGES', entityId: b.id } })).toBe(1);
    });

    it('validasi nominal: negatif, pecahan, DP > total, diskon > biaya, manipulasi total ditolak', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      const put = (body: Record<string, unknown>) => asAdmin(api().patch(`/api/v1/admin/bookings/${b.id}/pricing`)).send(body);
      const base = { packagePrice: 1_000_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 0 };
      await put({ ...base, packagePrice: -1 }).expect(400);
      await put({ ...base, packagePrice: 1000.5 }).expect(400);
      await put({ ...base, packagePrice: '1000000' }).expect(400);
      await put({ ...base, depositAmount: 2_000_000 }).expect(400);
      await put({ ...base, discountAmount: 2_000_000 }).expect(400);
      await put({ ...base, additionalFee: 50_000 }).expect(400); // tanpa keterangan
      await put({ ...base, totalAmount: 1 }).expect(400); // total dihitung server
      const ok = await put({ ...base, additionalFee: 50_000, additionalFeeNote: 'Sound system' }).expect(200);
      expect(Number(ok.body.pricing.totalAmount)).toBe(1_050_000);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'BOOKING_PRICING_UPDATE', entityId: b.id } });
      expect(audit.metadata).toMatchObject({ before: { totalAmount: '0' } });
    });

    it('rincian biaya terkunci setelah terkonfirmasi', async () => {
      const b = await dbBooking('CONFIRMED', futureDate(40), '10:00', '12:00');
      await asAdmin(api().patch(`/api/v1/admin/bookings/${b.id}/pricing`))
        .send({ packagePrice: 1, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 0 })
        .expect(409);
    });
  });

  describe('kalender', () => {
    it('event dalam rentang + penanda bentrok & status mengunci', async () => {
      const c = await loginAndroid(app);
      const pending = await customerBooking(c.accessToken); // +30 10–12
      const confirmed = await dbBooking('CONFIRMED', futureDate(30), '12:30', '14:00');
      await dbBooking('CANCELLED', futureDate(30), '16:00', '17:00');
      const far = await dbBooking('ACCEPTED', futureDate(90), '10:00', '12:00');

      const from = `${futureDate(29)}T00:00:00+07:00`;
      const to = `${futureDate(32)}T00:00:00+07:00`;
      const r = await asAdmin(api().get(`/api/v1/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).expect(200);
      expect(r.body.travelBufferMinutes).toBe(60);
      const ids = r.body.events.map((e: { id: string }) => e.id);
      expect(ids).toContain(pending.id);
      expect(ids).not.toContain(far.id);
      const ev = (id: string) => r.body.events.find((e: { id: string }) => e.id === id);
      expect(ev(pending.id)).toMatchObject({ blocking: false, conflicts: [expect.objectContaining({ id: confirmed.id, type: 'BUFFER' })] });
      expect(ev(confirmed.id).blocking).toBe(true);

      const filtered = await asAdmin(api().get(`/api/v1/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=CONFIRMED`)).expect(200);
      expect(filtered.body.events.map((e: { id: string }) => e.id)).toEqual([confirmed.id]);
      // Konflik tetap dihitung walau booking PENDING tersembunyi oleh filter
      expect(filtered.body.events[0].conflicts).toHaveLength(1);

      await asAdmin(api().get(`/api/v1/admin/calendar?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`)).expect(400);
      await asAdmin(api().get('/api/v1/admin/calendar?from=2027-01-01&to=2028-01-01')).expect(400);
    });
  });

  describe('pelanggan', () => {
    it('daftar, pencarian, detail & riwayat; tanpa data sensitif; admin tidak tercantum', async () => {
      const c1 = await loginAndroid(app, 'sub-c1', 'ani@example.com');
      await api().patch('/api/v1/me/profile').set('Authorization', `Bearer ${c1.accessToken}`).send({ whatsapp: '081299998888', city: 'Depok' }).expect(200);
      const b = await customerBooking(c1.accessToken);
      await loginAndroid(app, 'sub-c2', 'beni@example.com');

      const list = await asAdmin(api().get('/api/v1/admin/customers')).expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.items.map((u: { email: string }) => u.email)).not.toContain('admin.test@example.com');
      const ani = await asAdmin(api().get('/api/v1/admin/customers?q=0812-9999')).expect(200);
      expect(ani.body.items).toEqual([expect.objectContaining({ email: 'ani@example.com', whatsapp: '+6281299998888', city: 'Depok', bookingCount: 1, totalVerifiedPayments: '0' })]);

      const detail = await asAdmin(api().get(`/api/v1/admin/customers/${c1.user.id}`)).expect(200);
      expect(detail.body.bookings.map((x: { id: string }) => x.id)).toEqual([b.id]);
      expect(detail.body.stats).toMatchObject({ bookingCount: 1, active: 1 });
      const json = JSON.stringify(detail.body);
      expect(json).not.toMatch(/googleSub|google_sub|tokenHash|ipAddress|refresh/i);
      await asAdmin(api().get(`/api/v1/admin/customers/${randomUUID()}`)).expect(404);
    });

    it('total transaksi hanya menghitung pembayaran terverifikasi (dikurangi refund)', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await prisma.payment.createMany({
        data: [
          { code: 'P1', bookingId: b.id, type: 'DOWN_PAYMENT', method: 'CASH', amount: 500_000, paidAt: new Date(), status: 'VERIFIED' },
          { code: 'P2', bookingId: b.id, type: 'SETTLEMENT', method: 'CASH', amount: 700_000, paidAt: new Date(), status: 'PENDING' },
          { code: 'P3', bookingId: b.id, type: 'REFUND', method: 'CASH', amount: 100_000, paidAt: new Date(), status: 'VERIFIED' },
        ],
      });
      const d = await asAdmin(api().get(`/api/v1/admin/customers/${c.user.id}`)).expect(200);
      expect(d.body.stats.totalVerifiedPayments).toBe('400000');
    });
  });

  describe('pengaturan bisnis', () => {
    it('awal: DP & transport "belum dikonfigurasi", aturan jadwal belum dikonfirmasi pemilik', async () => {
      const s = await asAdmin(api().get('/api/v1/admin/settings')).expect(200);
      expect(s.body.payment.depositPolicy).toBeNull();
      expect(s.body.transport.mode).toBe('UNSET');
      expect(s.body.bookingRules.confirmedAt).toBeNull();
      expect(s.body.bookingForm.verifiedAgainstOriginalForm).toBe(false);
    });

    it('profil: validasi URL/WA, perubahan tampil di /site, tercatat audit', async () => {
      const patch = (body: Record<string, unknown>) => asAdmin(api().patch('/api/v1/admin/settings/profile')).send(body);
      await patch({ instagramUrl: 'http://instagram.com/x' }).expect(400);
      await patch({ googleMapsUrl: 'https://evil.example/maps' }).expect(400);
      await patch({ whatsappNumber: '12345' }).expect(400);
      await patch({ photoUrl: 'javascript:alert(1)' }).expect(400);
      await patch({ singleton: false }).expect(400);
      const ok = await patch({ whatsappNumber: '0812-3333-4444', tagline: 'MC untuk acara keluarga' }).expect(200);
      expect(ok.body.whatsappNumber).toBe('+6281233334444');
      const site = await api().get('/api/v1/site').expect(200);
      expect(site.body.profile.tagline).toBe('MC untuk acara keluarga');
      expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_PROFILE_UPDATE' } })).toBe(1);
      await patch({ tagline: '' }).expect(200);
      expect((await prisma.mcProfile.findFirstOrThrow()).tagline).toBeNull();
      // Kembalikan seed
      await prisma.mcProfile.updateMany({ data: { tagline: 'MC Profesional untuk Berbagai Acara', whatsappNumber: null } });
    });

    it('aturan jadwal: rentang divalidasi, dipakai saat cek bentrok', async () => {
      await asAdmin(api().put('/api/v1/admin/settings/booking-rules')).send({ travelBufferMinutes: -1, minLeadTimeHours: 24, maxAdvanceDays: 365 }).expect(400);
      await asAdmin(api().put('/api/v1/admin/settings/booking-rules')).send({ travelBufferMinutes: 0, minLeadTimeHours: 24, maxAdvanceDays: 365 }).expect(200);
      try {
        const c = await loginAndroid(app);
        const b = await customerBooking(c.accessToken);
        await dbBooking('CONFIRMED', futureDate(30), '12:00', '13:00'); // tepat setelah, tanpa buffer → boleh
        await transition(b.id, 'ACCEPTED').expect(200);
        const s = await asAdmin(api().get('/api/v1/admin/settings')).expect(200);
        expect(s.body.bookingRules.confirmedAt).not.toBeNull();
      } finally {
        await prisma.businessSetting.update({ where: { key: 'booking_rules' }, data: { value: { travelBufferMinutes: 60, minLeadTimeHours: 24, maxAdvanceDays: 365 } } });
      }
    });

    it('DP & transport: validasi, bisa dikembalikan ke "belum dikonfigurasi"; instruksi tampil ke pelanggan saat menunggu pembayaran', async () => {
      const pay = (body: Record<string, unknown>) => asAdmin(api().put('/api/v1/admin/settings/payment')).send(body);
      await pay({ depositType: 'PERCENT', depositValue: 150, bankAccounts: [] }).expect(400);
      await pay({ depositType: 'FIXED', bankAccounts: [] }).expect(400);
      await pay({ depositType: 'PERCENT', depositValue: 30, bankAccounts: [{ bankName: 'BCA', accountNumber: '12a', accountHolder: 'Hari' }] }).expect(400);
      await pay({ depositType: 'PERCENT', depositValue: 30, bankAccounts: [{ bankName: 'Bank Uji', accountNumber: '1234567890', accountHolder: 'Pemilik Uji' }], instructions: 'Kirim bukti ke WA' }).expect(200);

      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      let mine = await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(mine.body.paymentInstructions).toBeNull(); // belum menunggu pembayaran
      await transition(b.id, 'ACCEPTED').expect(200);
      await asAdmin(api().patch(`/api/v1/admin/bookings/${b.id}/pricing`)).send({ packagePrice: 1_000_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 300_000 }).expect(200);
      await transition(b.id, 'WAITING_PAYMENT').expect(200);
      mine = await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(mine.body.paymentInstructions.bankAccounts[0].accountNumber).toBe('1234567890');

      await pay({ depositType: 'UNSET', bankAccounts: [] }).expect(200);
      expect((await asAdmin(api().get('/api/v1/admin/settings'))).body.payment.depositPolicy).toBeNull();

      await asAdmin(api().put('/api/v1/admin/settings/transport')).send({ mode: 'FLAT' }).expect(400);
      await asAdmin(api().put('/api/v1/admin/settings/transport')).send({ mode: 'FLAT', flatAmount: 150_000 }).expect(200);
      await asAdmin(api().put('/api/v1/admin/settings/transport')).send({ mode: 'UNSET' }).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_UPDATE' } })).toBe(4); // 2× payment + 2× transport yang berhasil
    });

    it('kategori & paket: buat/ubah/arsip; paket aktif tampil publik; snapshot booking lama tidak berubah', async () => {
      const svc = await asAdmin(api().post('/api/v1/admin/services')).send({ name: 'Wisuda & Perpisahan' }).expect(201);
      expect(svc.body.slug).toBe('wisuda-perpisahan');
      await asAdmin(api().post('/api/v1/admin/packages')).send({ name: 'X', durationMinutes: 60, price: 0 }).expect(400);
      await asAdmin(api().post('/api/v1/admin/packages')).send({ name: 'Paket', durationMinutes: 60, price: 1, serviceId: randomUUID() }).expect(400);
      const pkg = await asAdmin(api().post('/api/v1/admin/packages'))
        .send({ serviceId: serviceId, name: 'Paket Uji 2 Jam', durationMinutes: 120, price: 1_750_000, facilities: ['Games interaktif', '  '] })
        .expect(201);
      expect(pkg.body.facilities).toEqual(['Games interaktif']);
      let site = await api().get('/api/v1/site').expect(200);
      expect(site.body.services.find((s: { id: string }) => s.id === serviceId).packages.map((p: { id: string }) => p.id)).toContain(pkg.body.id);
      expect(site.body.services.map((s: { name: string }) => s.name)).toContain('Wisuda & Perpisahan');

      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken, { packageId: pkg.body.id });
      await asAdmin(api().patch(`/api/v1/admin/packages/${pkg.body.id}`)).send({ price: 2_500_000 }).expect(200);
      expect(Number((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).packagePrice)).toBe(1_750_000);

      await asAdmin(api().delete(`/api/v1/admin/packages/${pkg.body.id}`)).expect(204);
      site = await api().get('/api/v1/site').expect(200);
      expect(site.body.services.find((s: { id: string }) => s.id === serviceId).packages).toEqual([]);
      await asAdmin(api().patch(`/api/v1/admin/services/${svc.body.id}`)).send({ isActive: false }).expect(200);
      site = await api().get('/api/v1/site').expect(200);
      expect(site.body.services.map((s: { name: string }) => s.name)).not.toContain('Wisuda & Perpisahan');
      expect(await prisma.auditLog.count({ where: { action: { in: ['SERVICE_CREATE', 'PACKAGE_CREATE', 'PACKAGE_UPDATE', 'PACKAGE_ARCHIVE', 'SERVICE_UPDATE'] } } })).toBe(5);
      await prisma.service.delete({ where: { id: svc.body.id } });
    });
  });

  describe('ajakan ulasan Google setelah acara selesai', () => {
    it('muncul hanya saat COMPLETED, untuk semua pelanggan; Place ID mengarahkan langsung ke form ulasan', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      const view = () => api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200).then((r) => r.body);

      expect((await view()).reviewInvite).toBeNull(); // PENDING
      await transition(b.id, 'ACCEPTED').expect(200);
      await asAdmin(api().patch(`/api/v1/admin/bookings/${b.id}/pricing`)).send({ packagePrice: 1_000_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 0 }).expect(200);
      await transition(b.id, 'WAITING_PAYMENT').expect(200);
      await asAdmin(api().post(`/api/v1/admin/bookings/${b.id}/payments`)).send({ amount: 1_000_000, method: 'CASH', paidAt: new Date().toISOString() }).expect(201);
      expect((await view()).reviewInvite).toBeNull(); // sudah bayar, tapi acara belum selesai
      await transition(b.id, 'IN_PROGRESS').expect(200);
      await transition(b.id, 'COMPLETED').expect(200);

      // Tanpa Place ID → halaman Google Maps
      expect((await view()).reviewInvite).toEqual({ url: 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9', direct: false });
      const n = await prisma.notification.findFirstOrThrow({ where: { userId: c.user.id, type: 'BOOKING_COMPLETED' } });
      expect(n.body).toContain('ulasan');
      expect(n.data).toMatchObject({ reviewUrl: 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9' });

      // Place ID: validasi lalu tautan langsung ke form "Tulis ulasan"
      await asAdmin(api().put('/api/v1/admin/settings/google-reviews')).send({ placeId: 'javascript:alert(1)' }).expect(400);
      await asAdmin(api().put('/api/v1/admin/settings/google-reviews')).send({ placeId: 'ChIJXUIBoOdFaS4RQb7d_K-FD3g' }).expect(200);
      try {
        expect((await view()).reviewInvite).toEqual({ url: 'https://search.google.com/local/writereview?placeid=ChIJXUIBoOdFaS4RQb7d_K-FD3g', direct: true });
        const settings = await asAdmin(api().get('/api/v1/admin/settings')).expect(200);
        expect(settings.body.integrations.googleReviewLink.direct).toBe(true);
        expect(await prisma.auditLog.count({ where: { action: 'SETTINGS_UPDATE', entityId: 'google_reviews' } })).toBe(1);
      } finally {
        await asAdmin(api().put('/api/v1/admin/settings/google-reviews')).send({ placeId: '' }).expect(200);
      }
      expect((await view()).reviewInvite.direct).toBe(false);
    });

    it('pesanan yang dibatalkan/ditolak tidak mendapat ajakan ulasan', async () => {
      const c = await loginAndroid(app);
      const b = await customerBooking(c.accessToken);
      await transition(b.id, 'REJECTED', { note: 'Jadwal sudah penuh' }).expect(200);
      const v = await api().get(`/api/v1/bookings/${b.id}`).set('Authorization', `Bearer ${c.accessToken}`).expect(200);
      expect(v.body.reviewInvite).toBeNull();
    });
  });

  describe('upload & portfolio', () => {
    it('hanya gambar asli (magic bytes) ≤ 5 MB; file dapat diakses publik; foto profil & portfolio', async () => {
      await asAdmin(api().post('/api/v1/admin/media')).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
      await asAdmin(api().post('/api/v1/admin/media')).attach('file', Buffer.alloc(6 * 1024 * 1024, 0xff), { filename: 'big.jpg', contentType: 'image/jpeg' }).expect(413);
      const up = await asAdmin(api().post('/api/v1/admin/media')).attach('file', PNG_1PX, { filename: 'foto.txt', contentType: 'text/plain' }).expect(201);
      expect(up.body).toMatchObject({ mimeType: 'image/png', url: expect.stringMatching(/^\/api\/v1\/media\/[0-9a-f-]{36}\.png$/) });

      const media = await api().get(up.body.url).expect(200);
      expect(media.headers['content-type']).toBe('image/png');
      await api().get('/api/v1/media/..%2F..%2F.env').expect(404);
      await api().get('/api/v1/media/00000000-0000-0000-0000-000000000000.png').expect(404);

      await asAdmin(api().patch('/api/v1/admin/settings/profile')).send({ photoUrl: up.body.url }).expect(200);
      await asAdmin(api().patch('/api/v1/admin/settings/profile')).send({ photoUrl: '/api/v1/media/00000000-0000-0000-0000-000000000000.png' }).expect(400);
      expect((await api().get('/api/v1/site')).body.profile.photoUrl).toBe(up.body.url);
      await prisma.mcProfile.updateMany({ data: { photoUrl: null } });

      await asAdmin(api().post('/api/v1/admin/portfolio')).send({ mediaType: 'IMAGE' }).expect(400);
      await asAdmin(api().post('/api/v1/admin/portfolio')).send({ mediaType: 'VIDEO', externalUrl: 'javascript:alert(1)' }).expect(400);
      const p1 = await asAdmin(api().post('/api/v1/admin/portfolio')).send({ mediaType: 'IMAGE', storageKey: up.body.key, title: 'Ultah Alya' }).expect(201);
      const p2 = await asAdmin(api().post('/api/v1/admin/portfolio')).send({ mediaType: 'VIDEO', externalUrl: 'https://www.instagram.com/reel/abc/', title: 'Highlight' }).expect(201);
      let site = await api().get('/api/v1/site').expect(200);
      expect(site.body.portfolio.map((p: { id: string }) => p.id)).toEqual([p1.body.id, p2.body.id]);

      await asAdmin(api().post('/api/v1/admin/portfolio/reorder')).send({ ids: [p2.body.id, p1.body.id] }).expect(200);
      await asAdmin(api().patch(`/api/v1/admin/portfolio/${p1.body.id}`)).send({ isActive: false }).expect(200);
      site = await api().get('/api/v1/site').expect(200);
      expect(site.body.portfolio.map((p: { id: string }) => p.id)).toEqual([p2.body.id]);
      await asAdmin(api().delete(`/api/v1/admin/portfolio/${p2.body.id}`)).expect(204);
      expect((await api().get('/api/v1/site')).body.portfolio).toEqual([]);
      expect(await prisma.portfolio.count()).toBe(2); // soft delete: data tidak hilang
    });
  });
});

describe('Dev login admin (opt-in)', () => {
  it('nonaktif secara default; jika aktif hanya untuk admin yang sudah diprovisioning, tidak pernah membuat admin', async () => {
    const off = await createTestApp({ ENABLE_DEV_LOGIN: 'true' });
    const prisma = off.get(PrismaService);
    try {
      await resetDb(prisma);
      await prisma.user.create({ data: { email: 'prov.admin@example.com', name: 'Admin', role: 'ADMIN', adminProfile: { create: { displayName: 'Admin' } } } });
      await request(off.getHttpServer()).post('/api/v1/auth/dev-login').set('X-Forwarded-For', freshIp()).send({ email: 'prov.admin@example.com', name: 'Admin Uji' }).expect(403);
    } finally {
      await off.close();
    }

    const on = await createTestApp({ ENABLE_DEV_LOGIN: 'true', ENABLE_DEV_ADMIN_LOGIN: 'true' });
    try {
      const cfg = await request(on.getHttpServer()).get('/api/v1/auth/config').expect(200);
      expect(cfg.body.devAdminLoginEnabled).toBe(true);
      const ok = await request(on.getHttpServer()).post('/api/v1/auth/dev-login').set('X-Forwarded-For', freshIp()).send({ email: 'prov.admin@example.com', name: 'Admin Uji' }).expect(200);
      expect(ok.body.user.role).toBe('ADMIN');
      const created = await request(on.getHttpServer()).post('/api/v1/auth/dev-login').set('X-Forwarded-For', freshIp()).send({ email: 'baru@example.com', name: 'Baru' }).expect(200);
      expect(created.body.user.role).toBe('CUSTOMER');
      const p = on.get(PrismaService);
      expect(await p.user.count({ where: { role: 'ADMIN' } })).toBe(1);
      await p.user.update({ where: { email: 'prov.admin@example.com' }, data: { googleSub: 'real-google' } });
      await request(on.getHttpServer()).post('/api/v1/auth/dev-login').set('X-Forwarded-For', freshIp()).send({ email: 'prov.admin@example.com', name: 'Admin Uji' }).expect(403);
    } finally {
      await on.close();
    }
  });
});
