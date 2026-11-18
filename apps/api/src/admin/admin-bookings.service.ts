import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { RequestMeta } from '../common/request-meta';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BLOCKING_STATUSES, STATUS_TIMESTAMP, TRANSITIONS, findTransition } from '../bookings/booking-status';
import { localToUtc } from '../bookings/schedule';
import type { AdminBookingQuery, PricingDto, TransitionDto } from './dto/admin-bookings.dto';
import { PaymentsService, paymentSelect, paymentView, type PaymentSummary } from '../payments/payments.service';

/** Kunci advisory lock Postgres untuk menserialisasi semua perubahan yang mengunci jadwal Hari. */
const SCHEDULE_LOCK_KEY = 4_217_001;
const PRICING_EDITABLE: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT'];
const REQUEST_CHANGES_ALLOWED: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED'];
const REASON_REQUIRED: BookingStatus[] = ['REJECTED', 'CANCELLED'];

const CUSTOMER_MESSAGES: Record<BookingStatus, { title: string; body: (code: string, note?: string) => string }> = {
  PENDING: { title: 'Pesanan terkirim', body: (c) => `Pesanan ${c} menunggu konfirmasi.` },
  ACCEPTED: { title: 'Pesanan diterima', body: (c) => `Hari Susanto menerima pesanan ${c}. Rincian biaya dan pembayaran akan diinformasikan.` },
  REJECTED: { title: 'Pesanan tidak dapat diterima', body: (c, n) => `Mohon maaf, pesanan ${c} tidak dapat diterima.${n ? ` Alasan: ${n}` : ''}` },
  WAITING_PAYMENT: { title: 'Menunggu pembayaran', body: (c) => `Silakan selesaikan pembayaran untuk pesanan ${c}. Rincian ada di halaman detail pesanan.` },
  CONFIRMED: { title: 'Pesanan terkonfirmasi', body: (c) => `Pembayaran diterima. Jadwal untuk pesanan ${c} sudah dikunci.` },
  IN_PROGRESS: { title: 'Acara dimulai', body: (c) => `Acara untuk pesanan ${c} sedang berlangsung.` },
  COMPLETED: { title: 'Acara selesai — bagikan pengalaman Anda', body: (c) => `Terima kasih! Acara untuk pesanan ${c} telah selesai. Ceritakan pengalaman Anda dengan memberi ulasan untuk Hari Susanto di Google.` },
  CANCELLED: { title: 'Pesanan dibatalkan', body: (c, n) => `Pesanan ${c} dibatalkan oleh Hari Susanto.${n ? ` Alasan: ${n}` : ''}` },
  REFUNDED: { title: 'Dana dikembalikan', body: (c) => `Dana untuk pesanan ${c} telah dikembalikan.` },
};

const detailInclude = {
  service: { select: { id: true, slug: true, name: true } },
  customer: { select: { id: true, name: true, email: true, avatarUrl: true, customerProfile: { select: { whatsapp: true, city: true } } } },
  eventDetail: true,
  statusLogs: { orderBy: { createdAt: 'asc' as const }, include: { actor: { select: { name: true, role: true } } } },
  payments: { orderBy: { createdAt: 'desc' as const }, select: paymentSelect },
  attachments: { orderBy: { createdAt: 'asc' as const }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
} satisfies Prisma.BookingInclude;

type AdminBooking = Prisma.BookingGetPayload<{ include: typeof detailInclude }>;

const isExclusionViolation = (e: unknown) => e instanceof Error && /bookings_no_overlap|23P01|exclusion/i.test(e.message);

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  // ───────────── List & detail ─────────────

  async list(q: AdminBookingQuery) {
    const base: Prisma.BookingWhereInput = { deletedAt: null };
    const and: Prisma.BookingWhereInput[] = [];
    if (q.q) {
      const term = q.q.trim();
      const digits = term.replace(/\D/g, '');
      const phone = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
      and.push({
        OR: [
          { code: { contains: term, mode: 'insensitive' } },
          { contactName: { contains: term, mode: 'insensitive' } },
          { contactEmail: { contains: term, mode: 'insensitive' } },
          { customer: { name: { contains: term, mode: 'insensitive' } } },
          { eventDetail: { eventName: { contains: term, mode: 'insensitive' } } },
          ...(phone.length >= 4 ? [{ contactWhatsapp: { contains: phone } }] : []),
        ],
      });
    }
    if (q.serviceId) and.push({ serviceId: q.serviceId });
    if (q.dateFrom) {
      const from = localToUtc(q.dateFrom, '00:00', 'Asia/Jakarta');
      if (!from) throw new BadRequestException('dateFrom tidak valid');
      and.push({ eventStartAt: { gte: from } });
    }
    if (q.dateTo) {
      const to = localToUtc(q.dateTo, '00:00', 'Asia/Jakarta');
      if (!to) throw new BadRequestException('dateTo tidak valid');
      and.push({ eventStartAt: { lt: new Date(to.getTime() + 86_400_000) } });
    }
    const whereNoStatus: Prisma.BookingWhereInput = { ...base, AND: and };
    const where: Prisma.BookingWhereInput = q.status?.length ? { ...whereNoStatus, status: { in: q.status } } : whereNoStatus;
    const orderBy: Prisma.BookingOrderByWithRelationInput =
      q.sort === 'event_asc' ? { eventStartAt: 'asc' } : q.sort === 'event_desc' ? { eventStartAt: 'desc' } : { createdAt: 'desc' };

    const [rows, total, grouped] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          service: { select: { name: true } },
          eventDetail: { select: { eventName: true, venueName: true, city: true } },
          _count: { select: { payments: { where: { status: 'PENDING' } } } },
        },
      }),
      this.prisma.booking.count({ where }),
      this.prisma.booking.groupBy({ by: ['status'], where: whereNoStatus, orderBy: { status: 'asc' }, _count: { _all: true } }),
    ]);
    const statusCounts = Object.fromEntries(Object.values(BookingStatus).map((s) => [s, 0])) as Record<BookingStatus, number>;
    for (const g of grouped) statusCounts[g.status] = (g._count as { _all: number })._all;

    return {
      items: rows.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        contactName: b.contactName,
        contactWhatsapp: b.contactWhatsapp,
        eventName: b.eventDetail?.eventName ?? '',
        venueName: b.eventDetail?.venueName ?? '',
        city: b.eventDetail?.city ?? '',
        serviceName: b.service.name,
        eventStartAt: b.eventStartAt,
        eventEndAt: b.eventEndAt,
        timezone: b.timezone,
        totalAmount: b.totalAmount,
        hasPrice: b.totalAmount.gt(0),
        pendingPayments: b._count.payments,
        createdAt: b.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      statusCounts,
    };
  }

  async detail(id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!b) throw new NotFoundException('Booking tidak ditemukan');
    const rules = await this.settings.bookingRules();
    const [conflicts, paymentSummary] = await Promise.all([
      this.conflictsFor(b.id, b.eventStartAt, b.eventEndAt, rules.travelBufferMinutes),
      this.payments.summary(b.id),
    ]);
    return this.toView(b, conflicts, rules.travelBufferMinutes, paymentSummary);
  }

  /** Booking lain (PENDING atau pengunci jadwal) yang bertabrakan, termasuk jeda perjalanan. */
  async conflictsFor(excludeId: string, start: Date, end: Date, bufferMinutes: number, tx: Prisma.TransactionClient = this.prisma, onlyBlocking = false) {
    const buffer = bufferMinutes * 60_000;
    const rows = await tx.booking.findMany({
      where: {
        id: { not: excludeId },
        deletedAt: null,
        status: { in: onlyBlocking ? BLOCKING_STATUSES : [...BLOCKING_STATUSES, 'PENDING'] },
        eventStartAt: { lt: new Date(end.getTime() + buffer) },
        eventEndAt: { gt: new Date(start.getTime() - buffer) },
      },
      orderBy: { eventStartAt: 'asc' },
      select: { id: true, code: true, status: true, contactName: true, eventStartAt: true, eventEndAt: true, eventDetail: { select: { eventName: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      contactName: r.contactName,
      eventName: r.eventDetail?.eventName ?? '',
      start: r.eventStartAt,
      end: r.eventEndAt,
      blocking: BLOCKING_STATUSES.includes(r.status),
      type: r.eventStartAt < end && r.eventEndAt > start ? ('OVERLAP' as const) : ('BUFFER' as const),
    }));
  }

  // ───────────── Transisi status ─────────────

  async transition(admin: AuthUser, id: string, dto: TransitionDto, meta: RequestMeta) {
    const to = dto.toStatus;
    const note = dto.note?.trim() || undefined;
    if (REASON_REQUIRED.includes(to) && (!note || note.length < 5)) {
      throw new BadRequestException({ statusCode: 400, message: 'Alasan wajib diisi (minimal 5 karakter)', errors: [{ field: 'note', message: 'Alasan wajib diisi' }] });
    }
    const rules = await this.settings.bookingRules();

    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Semua perubahan yang mengunci jadwal diserialisasi → cek bentrok + jeda perjalanan aman dari race.
          if (BLOCKING_STATUSES.includes(to)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_KEY})`;

          const b = await tx.booking.findFirst({ where: { id, deletedAt: null } });
          if (!b) throw new NotFoundException('Booking tidak ditemukan');
          if (dto.expectedStatus && dto.expectedStatus !== b.status) {
            throw new ConflictException({ statusCode: 409, code: 'STALE_STATUS', message: 'Status booking sudah berubah. Muat ulang halaman.' });
          }
          if (!findTransition(b.status, to, 'ADMIN')) {
            throw new ConflictException({ statusCode: 409, code: 'INVALID_TRANSITION', message: `Perubahan status dari ${b.status} ke ${to} tidak diizinkan` });
          }
          if (to === 'WAITING_PAYMENT' && !b.totalAmount.gt(0)) {
            throw new ConflictException({ statusCode: 409, code: 'PRICE_NOT_SET', message: 'Tetapkan rincian biaya terlebih dahulu sebelum meminta pembayaran' });
          }
          if (to === 'CONFIRMED') {
            // Konfirmasi hanya setelah pembayaran benar-benar tercatat & terverifikasi (DP, atau total bila DP tidak ditetapkan).
            const s = await this.payments.summary(id, tx);
            if (s.verifiedPaid < s.confirmThreshold) {
              throw new ConflictException({
                statusCode: 409,
                code: 'PAYMENT_NOT_VERIFIED',
                message: 'Belum ada pembayaran terverifikasi yang mencukupi. Verifikasi bukti transfer pelanggan atau catat pembayaran terlebih dahulu.',
              });
            }
          }
          if (to === 'REFUNDED') {
            const paid = await tx.payment.count({ where: { bookingId: id, status: 'VERIFIED', type: { not: 'REFUND' } } });
            if (paid === 0) throw new ConflictException({ statusCode: 409, code: 'NO_VERIFIED_PAYMENT', message: 'Tidak ada pembayaran terverifikasi untuk dikembalikan' });
          }
          if (BLOCKING_STATUSES.includes(to) && !BLOCKING_STATUSES.includes(b.status)) {
            const clashes = await this.conflictsFor(id, b.eventStartAt, b.eventEndAt, rules.travelBufferMinutes, tx, true);
            if (clashes.length) {
              throw new ConflictException({
                statusCode: 409,
                code: 'SLOT_CONFLICT',
                message: `Jadwal bentrok dengan ${clashes.map((c) => c.code).join(', ')} (termasuk jeda perjalanan ${rules.travelBufferMinutes} menit)`,
                conflicts: clashes.map((c) => ({ id: c.id, code: c.code, type: c.type })),
              });
            }
          }

          const now = new Date();
          const tsField = STATUS_TIMESTAMP[to];
          const updated = await tx.booking.updateMany({
            where: { id, status: b.status },
            data: {
              status: to,
              ...(tsField ? { [tsField]: now } : {}),
              ...(to === 'REJECTED' ? { rejectionReason: note } : {}),
              ...(to === 'CANCELLED' ? { cancellationReason: note } : {}),
            },
          });
          if (updated.count === 0) throw new ConflictException({ statusCode: 409, code: 'STALE_STATUS', message: 'Status booking baru saja berubah. Muat ulang halaman.' });

          const rule = findTransition(b.status, to, 'ADMIN')!;
          await tx.bookingStatusLog.create({
            data: { bookingId: id, fromStatus: b.status, toStatus: to, action: rule.action, actorType: 'ADMIN', actorUserId: admin.id, note },
          });
          await this.audit.log(
            { actorUserId: admin.id, actorType: 'ADMIN', action: `BOOKING_${rule.action}`, entityType: 'booking', entityId: id, metadata: { code: b.code, from: b.status, to, note: note ?? null }, meta },
            tx,
          );
          const msg = CUSTOMER_MESSAGES[to];
          const review = to === 'COMPLETED' ? await this.settings.googleReviewLink(tx) : null;
          await this.notifications.enqueue(
            [
              {
                userId: b.customerId,
                type: `BOOKING_${to}`,
                title: msg.title,
                body: msg.body(b.code, note),
                data: { bookingId: id, code: b.code, ...(review ? { reviewUrl: review.url } : {}) },
                dedupeKey: `booking:${id}:${to}:${b.customerId}`,
              },
            ],
            tx,
          );
        },
        { timeout: 15_000, maxWait: 10_000 },
      );
    } catch (e) {
      // Lapisan terakhir: exclusion constraint database.
      if (isExclusionViolation(e)) {
        throw new ConflictException({ statusCode: 409, code: 'SLOT_CONFLICT', message: 'Jadwal bentrok dengan booking lain yang sudah mengunci jadwal' });
      }
      throw e;
    }
    return this.detail(id);
  }

  // ───────────── Minta perubahan ─────────────

  async requestChanges(admin: AuthUser, id: string, message: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({ where: { id, deletedAt: null } });
      if (!b) throw new NotFoundException('Booking tidak ditemukan');
      if (!REQUEST_CHANGES_ALLOWED.includes(b.status)) {
        throw new ConflictException({ statusCode: 409, code: 'INVALID_STATE', message: 'Permintaan perubahan tidak dapat dikirim untuk status ini' });
      }
      const log = await tx.bookingStatusLog.create({
        data: { bookingId: id, fromStatus: b.status, toStatus: b.status, action: 'REQUEST_CHANGES', actorType: 'ADMIN', actorUserId: admin.id, note: message },
      });
      await this.audit.log(
        { actorUserId: admin.id, actorType: 'ADMIN', action: 'BOOKING_REQUEST_CHANGES', entityType: 'booking', entityId: id, metadata: { code: b.code, message }, meta },
        tx,
      );
      await this.notifications.enqueue(
        [
          {
            userId: b.customerId,
            type: 'BOOKING_CHANGES_REQUESTED',
            title: 'Hari Susanto meminta perubahan',
            body: `Untuk pesanan ${b.code}: ${message}`,
            data: { bookingId: id, code: b.code },
            dedupeKey: `booking:${id}:REQUEST_CHANGES:${log.id}`,
          },
        ],
        tx,
      );
    });
    return this.detail(id);
  }

  // ───────────── Rincian biaya ─────────────

  async updatePricing(admin: AuthUser, id: string, dto: PricingDto, meta: RequestMeta) {
    const total = dto.packagePrice + dto.transportFee + dto.additionalFee - dto.discountAmount;
    const errors: Array<{ field: string; message: string }> = [];
    if (total < 0) errors.push({ field: 'discountAmount', message: 'Diskon tidak boleh melebihi jumlah biaya' });
    if (dto.depositAmount > Math.max(total, 0)) errors.push({ field: 'depositAmount', message: 'DP tidak boleh melebihi total' });
    if (dto.additionalFee > 0 && !dto.additionalFeeNote?.trim()) errors.push({ field: 'additionalFeeNote', message: 'Jelaskan biaya tambahan' });
    if (errors.length) throw new BadRequestException({ statusCode: 400, message: 'Rincian biaya belum valid', errors });

    await this.prisma.$transaction(async (tx) => {
      const b = await tx.booking.findFirst({ where: { id, deletedAt: null } });
      if (!b) throw new NotFoundException('Booking tidak ditemukan');
      if (!PRICING_EDITABLE.includes(b.status)) {
        throw new ConflictException({ statusCode: 409, code: 'PRICING_LOCKED', message: 'Rincian biaya tidak dapat diubah pada status ini' });
      }
      const before = {
        packagePrice: b.packagePrice.toString(),
        transportFee: b.transportFee.toString(),
        additionalFee: b.additionalFee.toString(),
        discountAmount: b.discountAmount.toString(),
        totalAmount: b.totalAmount.toString(),
        depositAmount: b.depositAmount.toString(),
      };
      const updated = await tx.booking.updateMany({
        where: { id, status: b.status },
        data: {
          packagePrice: dto.packagePrice,
          transportFee: dto.transportFee,
          additionalFee: dto.additionalFee,
          additionalFeeNote: dto.additionalFee > 0 ? dto.additionalFeeNote?.trim() : null,
          discountAmount: dto.discountAmount,
          totalAmount: total,
          depositAmount: dto.depositAmount,
        },
      });
      if (updated.count === 0) throw new ConflictException({ statusCode: 409, code: 'STALE_STATUS', message: 'Status booking baru saja berubah. Muat ulang halaman.' });
      await this.audit.log(
        {
          actorUserId: admin.id,
          actorType: 'ADMIN',
          action: 'BOOKING_PRICING_UPDATE',
          entityType: 'booking',
          entityId: id,
          metadata: { code: b.code, before, after: { ...dto, totalAmount: String(total) } },
          meta,
        },
        tx,
      );
      if (b.status !== 'PENDING') {
        await this.notifications.enqueue(
          [
            {
              userId: b.customerId,
              type: 'BOOKING_PRICING_UPDATED',
              title: 'Rincian biaya diperbarui',
              body: `Rincian biaya untuk pesanan ${b.code} telah diperbarui. Lihat detail pesanan.`,
              data: { bookingId: id, code: b.code },
              dedupeKey: `booking:${id}:PRICING:${randomUUID()}`,
            },
          ],
          tx,
        );
      }
    });
    return this.detail(id);
  }

  // ───────────── Mapping ─────────────

  private toView(b: AdminBooking, conflicts: Awaited<ReturnType<AdminBookingsService['conflictsFor']>>, bufferMinutes: number, paymentSummary: PaymentSummary) {
    const e = b.eventDetail;
    const paid = paymentSummary.verifiedPaid >= paymentSummary.confirmThreshold;
    return {
      id: b.id,
      code: b.code,
      status: b.status,
      allowedTransitions: TRANSITIONS[b.status]
        .filter((r) => r.actors.includes('ADMIN'))
        // "Konfirmasi pembayaran" baru tersedia setelah pembayaran terverifikasi (normalnya terjadi otomatis saat verifikasi).
        .filter((r) => !(r.to === 'CONFIRMED' && !paid))
        .map((r) => ({ to: r.to, action: r.action, reasonRequired: REASON_REQUIRED.includes(r.to) })),
      paymentSummary,
      canRequestChanges: REQUEST_CHANGES_ALLOWED.includes(b.status),
      pricingEditable: PRICING_EDITABLE.includes(b.status),
      service: b.service,
      customer: {
        id: b.customer.id,
        name: b.customer.name,
        email: b.customer.email,
        avatarUrl: b.customer.avatarUrl,
        whatsapp: b.customer.customerProfile?.whatsapp ?? null,
        city: b.customer.customerProfile?.city ?? null,
      },
      contact: { name: b.contactName, email: b.contactEmail, whatsapp: b.contactWhatsapp },
      schedule: {
        start: b.eventStartAt,
        end: b.eventEndAt,
        timezone: b.timezone,
        durationMinutes: Math.round((b.eventEndAt.getTime() - b.eventStartAt.getTime()) / 60_000),
        travelBufferMinutes: bufferMinutes,
      },
      event: e
        ? {
            eventName: e.eventName,
            venueName: e.venueName,
            address: e.address,
            city: e.city,
            mapsUrl: e.mapsUrl,
            guestCount: e.guestCount,
            concept: e.concept,
            language: e.language,
            dressCode: e.dressCode,
            rundown: e.rundown,
            activityDescription: e.activityDescription,
            specialRequests: e.specialRequests,
            additionalNotes: e.additionalNotes,
          }
        : null,
      pricing: {
        packageName: b.packageName,
        packagePrice: b.packagePrice,
        durationMinutes: b.durationMinutes,
        transportFee: b.transportFee,
        additionalFee: b.additionalFee,
        additionalFeeNote: b.additionalFeeNote,
        discountAmount: b.discountAmount,
        totalAmount: b.totalAmount,
        depositAmount: b.depositAmount,
        currency: b.currency,
        hasPrice: b.totalAmount.gt(0),
      },
      formAnswers: b.formAnswers,
      cancellationReason: b.cancellationReason,
      rejectionReason: b.rejectionReason,
      payments: b.payments.map(paymentView),
      attachments: b.attachments,
      conflicts,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      timeline: b.statusLogs.map((l) => ({
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        action: l.action,
        actorType: l.actorType,
        actorName: l.actor?.name ?? null,
        note: l.note,
        createdAt: l.createdAt,
      })),
    };
  }
}
