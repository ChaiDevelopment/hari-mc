import { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import { resetDb } from './utils';
import { randomUUID } from 'node:crypto';

/**
 * Integritas database: FK, CHECK, unique (idempotensi), exclusion constraint anti double-booking,
 * transaksi, dan konkurensi. Diuji langsung terhadap PostgreSQL dengan migration production.
 */
describe('Database integrity', () => {
  const prisma = new PrismaClient();
  let customerId: string;
  let serviceId: string;

  const at = (h: number, m = 0) => new Date(Date.UTC(2027, 0, 15, h - 7, m)); // jam WIB pada 15 Jan 2027

  function bookingData(start: Date, end: Date, status: BookingStatus = 'PENDING'): Prisma.BookingUncheckedCreateInput {
    return {
      code: `HMC-T-${randomUUID().slice(0, 8)}`,
      customerId,
      serviceId,
      status,
      idempotencyKey: randomUUID(),
      eventStartAt: start,
      eventEndAt: end,
      contactName: 'Test',
      contactEmail: 'test@example.com',
      contactWhatsapp: '+6281234567890',
      privacyConsentAt: new Date(),
    };
  }

  beforeAll(async () => {
    await resetDb(prisma);
    const user = await prisma.user.create({ data: { email: 'db-test@example.com', name: 'DB Test', customerProfile: { create: {} } } });
    customerId = user.id;
    serviceId = (await prisma.service.findFirstOrThrow({ where: { slug: 'ulang-tahun-anak' } })).id;
  });
  beforeEach(() => prisma.booking.deleteMany());
  afterAll(() => prisma.$disconnect());

  describe('anti double-booking (exclusion constraint)', () => {
    it('menolak dua booking CONFIRMED yang bentrok', async () => {
      await prisma.booking.create({ data: bookingData(at(10), at(12), 'CONFIRMED') });
      await expect(prisma.booking.create({ data: bookingData(at(11), at(13), 'CONFIRMED') })).rejects.toThrow(/bookings_no_overlap|exclusion/i);
    });

    it('booking PENDING yang bentrok tetap boleh (Hari yang memilih)', async () => {
      await prisma.booking.create({ data: bookingData(at(10), at(12), 'CONFIRMED') });
      await expect(prisma.booking.create({ data: bookingData(at(10), at(12), 'PENDING') })).resolves.toBeDefined();
    });

    it('slot berurutan (12:00 selesai, 12:00 mulai) tidak dianggap bentrok', async () => {
      await prisma.booking.create({ data: bookingData(at(10), at(12), 'ACCEPTED') });
      await expect(prisma.booking.create({ data: bookingData(at(12), at(14), 'WAITING_PAYMENT') })).resolves.toBeDefined();
    });

    it('mengubah PENDING → ACCEPTED pada slot yang sudah terisi ditolak', async () => {
      await prisma.booking.create({ data: bookingData(at(10), at(12), 'CONFIRMED') });
      const pending = await prisma.booking.create({ data: bookingData(at(11), at(12), 'PENDING') });
      await expect(prisma.booking.update({ where: { id: pending.id }, data: { status: 'ACCEPTED' } })).rejects.toThrow();
    });

    it('booking yang dibatalkan membebaskan slot', async () => {
      const b = await prisma.booking.create({ data: bookingData(at(10), at(12), 'CONFIRMED') });
      await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
      await expect(prisma.booking.create({ data: bookingData(at(10), at(12), 'CONFIRMED') })).resolves.toBeDefined();
    });

    it('konkurensi: 10 penerimaan paralel untuk slot yang sama → tepat 1 berhasil', async () => {
      const pendings = await Promise.all(
        Array.from({ length: 10 }, (_, i) => prisma.booking.create({ data: bookingData(at(15), at(17, i), 'PENDING') })),
      );
      const results = await Promise.allSettled(
        pendings.map((p) => prisma.booking.update({ where: { id: p.id }, data: { status: 'ACCEPTED' } })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.booking.count({ where: { status: 'ACCEPTED' } })).toBe(1);
    });
  });

  describe('constraints', () => {
    it('idempotency key unik per customer (klik submit berkali-kali)', async () => {
      const key = randomUUID();
      await prisma.booking.create({ data: { ...bookingData(at(9), at(10)), idempotencyKey: key } });
      await expect(prisma.booking.create({ data: { ...bookingData(at(9), at(10)), idempotencyKey: key } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('foreign key: booking dengan customer yang tidak ada ditolak', async () => {
      await expect(prisma.booking.create({ data: { ...bookingData(at(9), at(10)), customerId: randomUUID() } })).rejects.toMatchObject({ code: 'P2003' });
    });

    it('jam selesai harus setelah jam mulai', async () => {
      await expect(prisma.booking.create({ data: bookingData(at(12), at(10)) })).rejects.toThrow(/bookings_time_order/);
    });

    it('DP tidak boleh melebihi total dan nilai tidak boleh negatif', async () => {
      await expect(prisma.booking.create({ data: { ...bookingData(at(9), at(10)), totalAmount: 100, depositAmount: 200 } })).rejects.toThrow(/bookings_amounts_nonneg/);
      await expect(prisma.booking.create({ data: { ...bookingData(at(9), at(10)), transportFee: -1 } })).rejects.toThrow(/bookings_amounts_nonneg/);
    });

    it('email user harus lowercase (unique tidak bisa diakali kapitalisasi)', async () => {
      await expect(prisma.user.create({ data: { email: 'DB-Test@Example.com', name: 'X' } })).rejects.toThrow(/users_email_lowercase/);
    });

    it('mc_profile hanya satu baris', async () => {
      await expect(prisma.mcProfile.create({ data: { displayName: 'X', businessName: 'Y' } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('pembayaran harus bernilai positif', async () => {
      const b = await prisma.booking.create({ data: bookingData(at(9), at(10)) });
      await expect(
        prisma.payment.create({ data: { code: 'PAY-T-1', bookingId: b.id, type: 'DOWN_PAYMENT', method: 'BANK_TRANSFER', amount: 0, paidAt: new Date() } }),
      ).rejects.toThrow(/payments_amount_pos/);
    });

    it('booking yang punya pembayaran tidak bisa dihapus (ON DELETE RESTRICT)', async () => {
      const b = await prisma.booking.create({ data: bookingData(at(9), at(10)) });
      await prisma.payment.create({ data: { code: `PAY-T-${randomUUID().slice(0, 6)}`, bookingId: b.id, type: 'DOWN_PAYMENT', method: 'CASH', amount: 500000, paidAt: new Date() } });
      await expect(prisma.booking.delete({ where: { id: b.id } })).rejects.toThrow();
      await prisma.payment.deleteMany({ where: { bookingId: b.id } });
    });
  });

  describe('transaksi', () => {
    it('rollback penuh jika satu langkah gagal (booking + event detail + log)', async () => {
      const key = randomUUID();
      await expect(
        prisma.$transaction(async (tx) => {
          const b = await tx.booking.create({ data: { ...bookingData(at(9), at(10)), idempotencyKey: key } });
          await tx.eventDetail.create({ data: { bookingId: b.id, eventName: 'Ultah', venueName: 'Rumah', address: 'Jl. X', city: 'Jakarta' } });
          await tx.bookingStatusLog.create({ data: { bookingId: b.id, toStatus: 'PENDING', action: 'SUBMIT', actorType: 'CUSTOMER' } });
          throw new Error('simulasi kegagalan notifikasi');
        }),
      ).rejects.toThrow('simulasi');
      expect(await prisma.booking.count({ where: { idempotencyKey: key } })).toBe(0);
      expect(await prisma.eventDetail.count()).toBe(0);
      expect(await prisma.bookingStatusLog.count()).toBe(0);
    });
  });

  describe('seed', () => {
    it('tidak ada harga/paket, review, atau pelanggan palsu', async () => {
      expect(await prisma.servicePackage.count()).toBe(0);
      expect(await prisma.externalReview.count()).toBe(0);
      const form = await prisma.businessSetting.findUniqueOrThrow({ where: { key: 'booking_form' } });
      expect((form.value as { verifiedAgainstOriginalForm: boolean }).verifiedAgainstOriginalForm).toBe(false);
      const payment = await prisma.businessSetting.findUniqueOrThrow({ where: { key: 'payment_info' } });
      expect((payment.value as { depositPolicy: unknown }).depositPolicy).toBeNull();
    });
  });
});
