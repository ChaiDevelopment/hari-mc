import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentMethod, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { RequestMeta } from '../common/request-meta';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { sniffProof, StorageService } from '../storage/storage.service';

type Tx = Prisma.TransactionClient;

/** Status di mana pelanggan boleh mengirim bukti / admin boleh mencatat pembayaran. */
const PAYABLE: BookingStatus[] = ['WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function paymentCode(): string {
  const wib = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(2, 10).replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `PAY-${wib}-${s}`;
}

export interface PaymentSummary {
  totalAmount: number;
  depositAmount: number;
  /** Jumlah yang harus terverifikasi agar pesanan terkonfirmasi: DP, atau total bila DP tidak ditetapkan. */
  confirmThreshold: number;
  verifiedPaid: number;
  pendingAmount: number;
  outstanding: number;
  /** Jumlah yang diminta dibayar sekarang (DP saat menunggu pembayaran; sisa pelunasan setelahnya). */
  dueNow: number;
  hasPendingPayment: boolean;
  canSubmitPayment: boolean;
}

export const paymentSelect = {
  id: true,
  code: true,
  type: true,
  method: true,
  amount: true,
  status: true,
  paidAt: true,
  verifiedAt: true,
  notes: true,
  createdAt: true,
  proofs: { select: { id: true, mimeType: true, fileName: true }, take: 1 },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export const paymentView = (p: PaymentRow) => ({
  id: p.id,
  code: p.code,
  type: p.type,
  method: p.method,
  amount: p.amount,
  status: p.status,
  paidAt: p.paidAt,
  verifiedAt: p.verifiedAt,
  notes: p.notes,
  createdAt: p.createdAt,
  proof: p.proofs[0] ? { mimeType: p.proofs[0].mimeType, fileName: p.proofs[0].fileName } : null,
});

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  notes?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────── Ringkasan ─────────────

  async summary(bookingId: string, tx: Tx = this.prisma): Promise<PaymentSummary> {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { status: true, totalAmount: true, depositAmount: true } });
    const payments = await tx.payment.findMany({ where: { bookingId }, select: { amount: true, status: true, type: true } });
    const sum = (f: (p: (typeof payments)[number]) => boolean) => payments.filter(f).reduce((n, p) => n + Number(p.amount), 0);
    const total = Number(b.totalAmount);
    const deposit = Number(b.depositAmount);
    const verifiedPaid = sum((p) => p.status === 'VERIFIED' && p.type !== 'REFUND');
    const pendingAmount = sum((p) => p.status === 'PENDING');
    const threshold = deposit > 0 ? deposit : total;
    const outstanding = Math.max(total - verifiedPaid, 0);
    const dueNow =
      b.status === 'WAITING_PAYMENT' ? Math.max(threshold - verifiedPaid, 0) : PAYABLE.includes(b.status) ? outstanding : 0;
    const hasPendingPayment = pendingAmount > 0;
    return {
      totalAmount: total,
      depositAmount: deposit,
      confirmThreshold: threshold,
      verifiedPaid,
      pendingAmount,
      outstanding,
      dueNow,
      hasPendingPayment,
      canSubmitPayment: PAYABLE.includes(b.status) && total > 0 && outstanding > 0 && !hasPendingPayment,
    };
  }

  /** Kunci baris booking selama transaksi (serialisasi pembayaran per pesanan). */
  private async lockBooking(tx: Tx, bookingId: string) {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
  }

  // ───────────── Pelanggan: kirim bukti bayar ─────────────

  async submitProof(user: AuthUser, bookingId: string, input: PaymentInput, file: Express.Multer.File | undefined, meta: RequestMeta) {
    if (!file) throw new BadRequestException({ statusCode: 400, message: 'Unggah foto/PDF bukti transfer', errors: [{ field: 'file', message: 'Bukti transfer wajib diunggah' }] });
    const mime = sniffProof(file.buffer);
    if (!mime) throw new BadRequestException({ statusCode: 400, message: 'Bukti harus berupa foto (JPG/PNG/WEBP) atau PDF, maks. 5 MB', errors: [{ field: 'file', message: 'Format tidak didukung' }] });
    this.assertPaidAt(input.paidAt);

    const own = await this.prisma.booking.findFirst({ where: { id: bookingId, customerId: user.id, deletedAt: null }, select: { id: true } });
    if (!own) throw new NotFoundException('Pesanan tidak ditemukan');
    const key = await this.storage.saveProof(file.buffer, mime);

    await this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, bookingId);
      const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const s = await this.summary(bookingId, tx);
      if (!PAYABLE.includes(b.status) || s.totalAmount <= 0) throw new ConflictException({ statusCode: 409, code: 'NOT_PAYABLE', message: 'Pesanan ini belum/tidak dalam tahap pembayaran' });
      if (s.hasPendingPayment) throw new ConflictException({ statusCode: 409, code: 'PAYMENT_PENDING', message: 'Bukti pembayaran sebelumnya masih menunggu verifikasi Hari Susanto' });
      if (s.outstanding <= 0) throw new ConflictException({ statusCode: 409, code: 'ALREADY_PAID', message: 'Pesanan ini sudah lunas' });
      if (input.amount > s.outstanding) {
        throw new BadRequestException({ statusCode: 400, message: 'Nominal melebihi sisa tagihan', errors: [{ field: 'amount', message: `Maksimal Rp ${s.outstanding.toLocaleString('id-ID')}` }] });
      }
      const isFirst = (await tx.payment.count({ where: { bookingId, status: 'VERIFIED', type: { not: 'REFUND' } } })) === 0;
      const payment = await tx.payment.create({
        data: {
          code: paymentCode(),
          bookingId,
          type: isFirst && b.status === 'WAITING_PAYMENT' && input.amount < s.outstanding ? 'DOWN_PAYMENT' : 'SETTLEMENT',
          method: input.method,
          amount: input.amount,
          paidAt: new Date(input.paidAt),
          status: 'PENDING',
          notes: input.notes?.trim() || null,
          recordedById: user.id,
          proofs: { create: { storageKey: key, fileName: file.originalname.slice(0, 200), mimeType: mime, sizeBytes: file.size, uploadedById: user.id } },
        },
      });
      await this.audit.log(
        { actorUserId: user.id, actorType: 'CUSTOMER', action: 'PAYMENT_PROOF_SUBMIT', entityType: 'payment', entityId: payment.id, metadata: { bookingId, code: payment.code, amount: input.amount }, meta },
        tx,
      );
      const adminId = await this.notifications.adminUserId(tx);
      await this.notifications.enqueue(
        [
          {
            userId: user.id,
            type: 'PAYMENT_SUBMITTED',
            title: 'Bukti pembayaran terkirim',
            body: `Bukti pembayaran untuk ${b.code} sedang diverifikasi Hari Susanto.`,
            data: { bookingId, code: b.code },
            dedupeKey: `payment:${payment.id}:SUBMITTED:${user.id}`,
          },
          ...(adminId
            ? [
                {
                  userId: adminId,
                  type: 'ADMIN_PAYMENT_PROOF',
                  title: 'Bukti pembayaran masuk',
                  body: `${b.contactName} mengirim bukti pembayaran Rp ${input.amount.toLocaleString('id-ID')} untuk ${b.code}.`,
                  data: { bookingId, code: b.code },
                  dedupeKey: `payment:${payment.id}:SUBMITTED:${adminId}`,
                },
              ]
            : []),
        ],
        tx,
      );
    });
  }

  // ───────────── Admin: verifikasi / tolak / catat manual ─────────────

  async verify(admin: AuthUser, paymentId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!p) throw new NotFoundException('Pembayaran tidak ditemukan');
      await this.lockBooking(tx, p.bookingId);
      const updated = await tx.payment.updateMany({ where: { id: paymentId, status: 'PENDING' }, data: { status: 'VERIFIED', verifiedById: admin.id, verifiedAt: new Date() } });
      if (updated.count === 0) throw new ConflictException({ statusCode: 409, code: 'PAYMENT_NOT_PENDING', message: 'Pembayaran ini sudah diproses' });
      await this.audit.log({ actorUserId: admin.id, actorType: 'ADMIN', action: 'PAYMENT_VERIFY', entityType: 'payment', entityId: paymentId, metadata: { bookingId: p.bookingId, code: p.code, amount: p.amount.toString() }, meta }, tx);
      await this.afterVerified(tx, admin, p.bookingId, p.code, meta);
      return p.bookingId;
    });
  }

  async reject(admin: AuthUser, paymentId: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { booking: { select: { code: true, customerId: true } } } });
      if (!p) throw new NotFoundException('Pembayaran tidak ditemukan');
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'REJECTED', verifiedById: admin.id, verifiedAt: new Date(), notes: [p.notes, `Ditolak: ${reason}`].filter(Boolean).join('\n') },
      });
      if (updated.count === 0) throw new ConflictException({ statusCode: 409, code: 'PAYMENT_NOT_PENDING', message: 'Pembayaran ini sudah diproses' });
      await this.audit.log({ actorUserId: admin.id, actorType: 'ADMIN', action: 'PAYMENT_REJECT', entityType: 'payment', entityId: paymentId, metadata: { bookingId: p.bookingId, code: p.code, reason }, meta }, tx);
      await this.notifications.enqueue(
        [
          {
            userId: p.booking.customerId,
            type: 'PAYMENT_REJECTED',
            title: 'Bukti pembayaran perlu dicek ulang',
            body: `Bukti pembayaran untuk ${p.booking.code} belum dapat diterima. Alasan: ${reason}. Silakan kirim ulang.`,
            data: { bookingId: p.bookingId, code: p.booking.code },
            dedupeKey: `payment:${paymentId}:REJECTED:${p.booking.customerId}`,
          },
        ],
        tx,
      );
      return p.bookingId;
    });
  }

  /** Pembayaran yang diterima langsung (tunai / transfer yang dicek Hari sendiri) — langsung terverifikasi. */
  async recordManual(admin: AuthUser, bookingId: string, input: PaymentInput, meta: RequestMeta) {
    this.assertPaidAt(input.paidAt);
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({ where: { id: bookingId, deletedAt: null } });
      if (!b) throw new NotFoundException('Booking tidak ditemukan');
      await this.lockBooking(tx, bookingId);
      const s = await this.summary(bookingId, tx);
      if (!PAYABLE.includes(b.status) || s.totalAmount <= 0) throw new ConflictException({ statusCode: 409, code: 'NOT_PAYABLE', message: 'Pembayaran hanya dapat dicatat setelah biaya ditetapkan dan pembayaran diminta' });
      if (input.amount > s.outstanding) {
        throw new BadRequestException({ statusCode: 400, message: 'Nominal melebihi sisa tagihan', errors: [{ field: 'amount', message: `Maksimal Rp ${s.outstanding.toLocaleString('id-ID')}` }] });
      }
      const isFirst = s.verifiedPaid === 0;
      const payment = await tx.payment.create({
        data: {
          code: paymentCode(),
          bookingId,
          type: isFirst && b.status === 'WAITING_PAYMENT' && input.amount < s.outstanding ? 'DOWN_PAYMENT' : 'SETTLEMENT',
          method: input.method,
          amount: input.amount,
          paidAt: new Date(input.paidAt),
          status: 'VERIFIED',
          notes: input.notes?.trim() || null,
          recordedById: admin.id,
          verifiedById: admin.id,
          verifiedAt: new Date(),
        },
      });
      await this.audit.log({ actorUserId: admin.id, actorType: 'ADMIN', action: 'PAYMENT_RECORD', entityType: 'payment', entityId: payment.id, metadata: { bookingId, code: payment.code, amount: input.amount, method: input.method }, meta }, tx);
      await this.afterVerified(tx, admin, bookingId, payment.code, meta);
      return bookingId;
    });
  }

  /**
   * Setelah pembayaran terverifikasi: jika pesanan menunggu pembayaran dan jumlah terverifikasi sudah
   * mencapai DP (atau total bila DP tidak ditetapkan) → otomatis TERKONFIRMASI.
   */
  private async afterVerified(tx: Tx, admin: AuthUser, bookingId: string, paymentCodeStr: string, meta: RequestMeta) {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const s = await this.summary(bookingId, tx);
    if (b.status === 'WAITING_PAYMENT' && s.verifiedPaid >= s.confirmThreshold) {
      const moved = await tx.booking.updateMany({ where: { id: bookingId, status: 'WAITING_PAYMENT' }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      if (moved.count === 1) {
        const note = `Pembayaran ${paymentCodeStr} terverifikasi`;
        await tx.bookingStatusLog.create({ data: { bookingId, fromStatus: 'WAITING_PAYMENT', toStatus: 'CONFIRMED', action: 'CONFIRM_PAYMENT', actorType: 'ADMIN', actorUserId: admin.id, note } });
        await this.audit.log({ actorUserId: admin.id, actorType: 'ADMIN', action: 'BOOKING_CONFIRM_PAYMENT', entityType: 'booking', entityId: bookingId, metadata: { code: b.code, from: 'WAITING_PAYMENT', to: 'CONFIRMED', note }, meta }, tx);
        await this.notifications.enqueue(
          [
            {
              userId: b.customerId,
              type: 'BOOKING_CONFIRMED',
              title: 'Pesanan terkonfirmasi',
              body: `Pembayaran diterima. Jadwal untuk pesanan ${b.code} sudah dikunci.`,
              data: { bookingId, code: b.code },
              dedupeKey: `booking:${bookingId}:CONFIRMED:${b.customerId}`,
            },
          ],
          tx,
        );
        return;
      }
    }
    await this.notifications.enqueue(
      [
        {
          userId: b.customerId,
          type: 'PAYMENT_VERIFIED',
          title: 'Pembayaran diterima',
          body: s.outstanding > 0 ? `Pembayaran ${paymentCodeStr} diterima. Sisa tagihan Rp ${s.outstanding.toLocaleString('id-ID')}.` : `Pembayaran ${paymentCodeStr} diterima. Pesanan ${b.code} lunas.`,
          data: { bookingId, code: b.code },
          dedupeKey: `payment:${paymentCodeStr}:VERIFIED:${b.customerId}`,
        },
      ],
      tx,
    );
  }

  // ───────────── Data untuk tampilan ─────────────

  async listForBooking(bookingId: string) {
    const rows = await this.prisma.payment.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' }, select: paymentSelect });
    return rows.map(paymentView);
  }

  /** Informasi cara bayar untuk pelanggan (rekening dari CMS; jika kosong, arahkan ke kontak Hari). */
  async instructions() {
    const [info, profile] = await Promise.all([
      this.settings.get<{ bankAccounts?: Array<{ bankName: string; accountNumber: string; accountHolder: string }>; instructions?: string | null }>('payment_info'),
      this.prisma.mcProfile.findFirst({ select: { whatsappNumber: true } }),
    ]);
    return { bankAccounts: info?.bankAccounts ?? [], instructions: info?.instructions ?? null, contactWhatsapp: profile?.whatsappNumber ?? null };
  }

  /** Bukti bayar: pemilik pesanan atau admin saja. */
  async proofFor(paymentId: string, opts: { customerId?: string; bookingId?: string }) {
    const p = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        ...(opts.bookingId ? { bookingId: opts.bookingId } : {}),
        ...(opts.customerId ? { booking: { customerId: opts.customerId, deletedAt: null } } : {}),
      },
      select: { proofs: { select: { storageKey: true, mimeType: true }, take: 1 } },
    });
    const proof = p?.proofs[0];
    const file = proof ? this.storage.openProof(proof.storageKey) : null;
    if (!proof || !file) throw new NotFoundException('Bukti pembayaran tidak ditemukan');
    return { ...file, mimeType: proof.mimeType };
  }

  async pendingCount() {
    return this.prisma.payment.count({ where: { status: 'PENDING', booking: { deletedAt: null } } });
  }

  private assertPaidAt(paidAt: string) {
    const d = new Date(paidAt);
    if (Number.isNaN(+d) || +d > Date.now() + 86_400_000 || +d < Date.now() - 400 * 86_400_000) {
      throw new BadRequestException({ statusCode: 400, message: 'Tanggal pembayaran tidak valid', errors: [{ field: 'paidAt', message: 'Tanggal pembayaran tidak valid' }] });
    }
  }
}
