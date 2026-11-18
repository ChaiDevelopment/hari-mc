import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, fakeIdToken, freshIp, loginAndroid, resetDb } from './utils';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a59f0000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const futureDate = (d: number) => new Date(Date.now() + 7 * 3_600_000 + d * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString();

/**
 * Alur pembayaran: Menunggu Pembayaran → pelanggan kirim bukti → Hari verifikasi → otomatis Terkonfirmasi,
 * lalu pelunasan. Termasuk penolakan bukti, pencatatan manual, privasi bukti, dan validasi.
 */
describe('Pembayaran & bukti transfer', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let serviceId: string;
  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${admin}`).set('X-Forwarded-For', freshIp());

  /** Booking pelanggan sampai status WAITING_PAYMENT dengan total 1.500.000 dan DP sesuai argumen. */
  async function bookingWaitingPayment(deposit = 500_000, day = 30) {
    const c = await loginAndroid(app);
    const b = await api()
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${c.accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', freshIp())
      .send({
        contactName: 'Sari',
        contactEmail: 'sari@example.com',
        contactWhatsapp: '081234567890',
        eventName: 'Ultah Bima',
        serviceId,
        eventDate: futureDate(day),
        startTime: '10:00',
        endTime: '12:00',
        timezone: 'Asia/Jakarta',
        venueName: 'Rumah',
        address: 'Jl. Bayar No. 1',
        city: 'Jakarta',
        privacyConsent: true,
        dataConfirmed: true,
      })
      .expect(201);
    const id = b.body.id as string;
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/transition`)).send({ toStatus: 'ACCEPTED' }).expect(200);
    await asAdmin(api().patch(`/api/v1/admin/bookings/${id}/pricing`)).send({ packagePrice: 1_500_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: deposit }).expect(200);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/transition`)).send({ toStatus: 'WAITING_PAYMENT' }).expect(200);
    return { id, token: c.accessToken, userId: c.user.id };
  }

  const submitProof = (token: string, id: string, fields: Record<string, string>, file: Buffer | null = PNG, filename = 'bukti.png') => {
    let r = api().post(`/api/v1/bookings/${id}/payments`).set('Authorization', `Bearer ${token}`).set('X-Forwarded-For', freshIp());
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    if (file) r = r.attach('file', file, { filename });
    return r;
  };
  const mine = (token: string, id: string) => api().get(`/api/v1/bookings/${id}`).set('Authorization', `Bearer ${token}`).expect(200).then((r) => r.body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    serviceId = (await prisma.service.findUniqueOrThrow({ where: { slug: 'ulang-tahun-anak' } })).id;
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await prisma.user.create({ data: { email: 'admin.pay@example.com', name: 'Hari Susanto', role: 'ADMIN', adminProfile: { create: { displayName: 'Hari' } } } });
    const r = await api().post('/api/v1/auth/google').set('X-Forwarded-For', freshIp()).send({ idToken: fakeIdToken('admin-pay', 'admin.pay@example.com'), client: 'android' }).expect(200);
    admin = r.body.accessToken;
  });
  afterAll(() => app.close());

  it('menunggu pembayaran: pelanggan melihat jumlah yang harus dibayar dan cara bayar walau rekening belum diisi', async () => {
    const { id, token } = await bookingWaitingPayment();
    const b = await mine(token, id);
    expect(b.paymentSummary).toMatchObject({ totalAmount: 1_500_000, depositAmount: 500_000, dueNow: 500_000, canSubmitPayment: true, hasPendingPayment: false });
    expect(b.paymentInstructions).toEqual({ bankAccounts: [], instructions: null, contactWhatsapp: null });
  });

  it('alur utama: kirim bukti → Hari verifikasi → otomatis TERKONFIRMASI; tercatat di riwayat, audit, notifikasi', async () => {
    const { id, token, userId } = await bookingWaitingPayment();
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today(), notes: 'Transfer BCA' }).expect(201);

    let b = await mine(token, id);
    expect(b.status).toBe('WAITING_PAYMENT');
    expect(b.paymentSummary).toMatchObject({ hasPendingPayment: true, canSubmitPayment: false, pendingAmount: 500_000 });
    expect(b.payments[0]).toMatchObject({ status: 'PENDING', type: 'DOWN_PAYMENT', proof: { mimeType: 'image/png' } });

    // Hari melihat bukti di detail & notifikasi
    const detail = await asAdmin(api().get(`/api/v1/admin/bookings/${id}`)).expect(200);
    expect(detail.body.allowedTransitions.map((t: { to: string }) => t.to)).not.toContain('CONFIRMED'); // belum bisa konfirmasi tanpa verifikasi
    const paymentId = detail.body.payments[0].id;
    expect(await prisma.notification.count({ where: { type: 'ADMIN_PAYMENT_PROOF' } })).toBe(1);
    expect((await asAdmin(api().get('/api/v1/admin/dashboard'))).body.counts.pendingPayments).toBe(1);

    await asAdmin(api().post(`/api/v1/admin/payments/${paymentId}/verify`)).expect(200);
    b = await mine(token, id);
    expect(b.status).toBe('CONFIRMED');
    expect(b.timeline.at(-1)).toMatchObject({ toStatus: 'CONFIRMED', action: 'CONFIRM_PAYMENT', actorType: 'ADMIN' });
    expect(b.paymentSummary).toMatchObject({ verifiedPaid: 500_000, outstanding: 1_000_000, dueNow: 1_000_000, canSubmitPayment: true });
    expect(await prisma.notification.count({ where: { userId, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_VERIFY', entityId: paymentId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'BOOKING_CONFIRM_PAYMENT', entityId: id } })).toBe(1);
    // Verifikasi ganda ditolak
    await asAdmin(api().post(`/api/v1/admin/payments/${paymentId}/verify`)).expect(409);

    // Pelunasan
    await submitProof(token, id, { amount: '1000000', method: 'E_WALLET', paidAt: today() }, PDF, 'pelunasan.pdf').expect(201);
    const p2 = (await mine(token, id)).payments.find((p: { status: string }) => p.status === 'PENDING');
    expect(p2).toMatchObject({ type: 'SETTLEMENT', proof: { mimeType: 'application/pdf' } });
    await asAdmin(api().post(`/api/v1/admin/payments/${p2.id}/verify`)).expect(200);
    b = await mine(token, id);
    expect(b.status).toBe('CONFIRMED');
    expect(b.paymentSummary).toMatchObject({ verifiedPaid: 1_500_000, outstanding: 0, dueNow: 0, canSubmitPayment: false });
    expect(b.paymentInstructions).toBeNull();
    await submitProof(token, id, { amount: '1', method: 'BANK_TRANSFER', paidAt: today() }).expect(409);

    // Total transaksi pelanggan kini tercatat
    const cust = await asAdmin(api().get(`/api/v1/admin/customers/${userId}`)).expect(200);
    expect(cust.body.stats.totalVerifiedPayments).toBe('1500000');
  });

  it('pembayaran sebagian (kurang dari DP) belum mengonfirmasi pesanan', async () => {
    const { id, token } = await bookingWaitingPayment();
    await submitProof(token, id, { amount: '200000', method: 'BANK_TRANSFER', paidAt: today() }).expect(201);
    const pid = (await mine(token, id)).payments[0].id;
    await asAdmin(api().post(`/api/v1/admin/payments/${pid}/verify`)).expect(200);
    const b = await mine(token, id);
    expect(b.status).toBe('WAITING_PAYMENT');
    expect(b.paymentSummary).toMatchObject({ verifiedPaid: 200_000, dueNow: 300_000, canSubmitPayment: true });
  });

  it('tanpa DP: total harus lunas untuk terkonfirmasi', async () => {
    const { id, token } = await bookingWaitingPayment(0);
    expect((await mine(token, id)).paymentSummary.dueNow).toBe(1_500_000);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/payments`)).send({ amount: 1_500_000, method: 'CASH', paidAt: today() }).expect(201);
    expect((await mine(token, id)).status).toBe('CONFIRMED');
    expect((await mine(token, id)).payments[0].type).toBe('SETTLEMENT'); // lunas sekaligus = pelunasan, bukan DP
  });

  it('bukti ditolak dengan alasan → pelanggan melihat alasannya dan dapat mengirim ulang', async () => {
    const { id, token, userId } = await bookingWaitingPayment();
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(201);
    const pid = (await mine(token, id)).payments[0].id;
    await asAdmin(api().post(`/api/v1/admin/payments/${pid}/reject`)).send({ reason: 'abc' }).expect(400);
    await asAdmin(api().post(`/api/v1/admin/payments/${pid}/reject`)).send({ reason: 'Nominal di bukti tidak terbaca' }).expect(200);
    const b = await mine(token, id);
    expect(b.status).toBe('WAITING_PAYMENT');
    expect(b.payments[0]).toMatchObject({ status: 'REJECTED', notes: expect.stringContaining('Nominal di bukti tidak terbaca') });
    expect(b.paymentSummary.canSubmitPayment).toBe(true);
    expect(await prisma.notification.count({ where: { userId, type: 'PAYMENT_REJECTED' } })).toBe(1);
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(201);
  });

  it('validasi: status belum pembayaran, file bukan gambar/PDF, nominal, tanggal, bukti ganda', async () => {
    // Masih PENDING (belum diminta bayar)
    const c = await loginAndroid(app);
    const pend = await api()
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${c.accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', freshIp())
      .send({ contactName: 'A B', contactEmail: 'a@example.com', contactWhatsapp: '081234567890', eventName: 'X Y', serviceId, eventDate: futureDate(50), startTime: '10:00', endTime: '12:00', timezone: 'Asia/Jakarta', venueName: 'Rumah', address: 'Jl. Satu 1', city: 'Jakarta', privacyConsent: true, dataConfirmed: true })
      .expect(201);
    await submitProof(c.accessToken, pend.body.id, { amount: '1000', method: 'BANK_TRANSFER', paidAt: today() }).expect(409);

    const { id, token } = await bookingWaitingPayment();
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }, null).expect(400);
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }, Buffer.from('<html><script>alert(1)</script>'), 'bukti.png').expect(400);
    await submitProof(token, id, { amount: '0', method: 'BANK_TRANSFER', paidAt: today() }).expect(400);
    await submitProof(token, id, { amount: '5000000', method: 'BANK_TRANSFER', paidAt: today() }).expect(400); // > sisa tagihan
    await submitProof(token, id, { amount: '500000', method: 'CASH', paidAt: today() }).expect(400); // tunai dicatat Hari
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: '2099-01-01' }).expect(400);
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today(), status: 'VERIFIED' }).expect(400); // mass assignment
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(201);
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(409); // masih ada yang menunggu
    expect(await prisma.payment.count({ where: { bookingId: id } })).toBe(1);
  });

  it('privasi bukti bayar: hanya pemilik & admin; tidak tersedia lewat /media publik', async () => {
    const { id, token } = await bookingWaitingPayment();
    await submitProof(token, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(201);
    const pid = (await mine(token, id)).payments[0].id;
    const own = await api().get(`/api/v1/bookings/${id}/payments/${pid}/proof`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(own.headers['content-type']).toBe('image/png');
    expect(own.headers['cache-control']).toContain('no-store');
    await asAdmin(api().get(`/api/v1/admin/payments/${pid}/proof`)).expect(200);

    const other = await loginAndroid(app);
    await api().get(`/api/v1/bookings/${id}/payments/${pid}/proof`).set('Authorization', `Bearer ${other.accessToken}`).expect(404);
    await submitProof(other.accessToken, id, { amount: '500000', method: 'BANK_TRANSFER', paidAt: today() }).expect(404);
    await api().get(`/api/v1/bookings/${id}/payments/${pid}/proof`).expect(401);
    const key = (await prisma.paymentProof.findFirstOrThrow()).storageKey;
    await api().get(`/api/v1/media/${key}`).expect(404);
    // Pelanggan tidak bisa memverifikasi sendiri
    await api().post(`/api/v1/admin/payments/${pid}/verify`).set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('pencatatan manual: hanya setelah biaya & permintaan bayar; nominal dibatasi sisa tagihan; refund kini konsisten', async () => {
    const { id, token } = await bookingWaitingPayment();
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/payments`)).send({ amount: 2_000_000, method: 'CASH', paidAt: today() }).expect(400);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/payments`)).send({ amount: 500_000, method: 'CASH', paidAt: today(), status: 'PENDING' }).expect(400);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/payments`)).send({ amount: 500_000, method: 'CASH', paidAt: today() }).expect(201);
    expect((await mine(token, id)).status).toBe('CONFIRMED');

    // Pesanan yang sudah dibayar lalu dibatalkan kini BISA ditandai refund (sebelumnya mustahil)
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/transition`)).send({ toStatus: 'CANCELLED', note: 'Acara batal karena cuaca' }).expect(200);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/transition`)).send({ toStatus: 'REFUNDED' }).expect(200);
    await asAdmin(api().post(`/api/v1/admin/bookings/${id}/payments`)).send({ amount: 1, method: 'CASH', paidAt: today() }).expect(409);
  });
});
