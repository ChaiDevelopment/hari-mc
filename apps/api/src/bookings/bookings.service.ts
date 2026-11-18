import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { RequestMeta } from '../common/request-meta';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PaymentsService } from '../payments/payments.service';
import { normalizeIndonesianPhone } from '../users/phone';
import { generateBookingCode } from './booking-code';
import { BLOCKING_STATUSES, customerActions, findTransition } from './booking-status';
import type { CreateBookingDto } from './dto/create-booking.dto';
import { validateConfiguredRequired, validateFormAnswers } from './form-config';
import { validateSchedule, type FieldError } from './schedule';

const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'];

const detailInclude = {
  service: { select: { id: true, slug: true, name: true } },
  eventDetail: true,
  statusLogs: {
    orderBy: { createdAt: 'asc' as const },
    select: { fromStatus: true, toStatus: true, action: true, actorType: true, note: true, createdAt: true },
  },
} satisfies Prisma.BookingInclude;

type BookingWithDetail = Prisma.BookingGetPayload<{ include: typeof detailInclude }>;

export type ListScope = 'upcoming' | 'past' | 'all';

function isUniqueViolationOn(e: unknown, needle: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    JSON.stringify(e.meta ?? {}).toLowerCase().includes(needle)
  );
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  // ───────────── Submit ─────────────

  async create(user: AuthUser, dto: CreateBookingDto, idempotencyKey: string, meta: RequestMeta) {
    // 1. Idempotensi: submit ulang dengan key yang sama → kembalikan booking yang sudah ada.
    const replay = await this.findIdByKey(user.id, idempotencyKey);
    if (replay) return { booking: await this.getForCustomer(user.id, replay), replay: true };

    // 2. Validasi bisnis di backend (melengkapi validasi DTO).
    const [form, rules] = await Promise.all([this.settings.bookingForm(), this.settings.bookingRules()]);
    const errors: FieldError[] = [];
    const schedule = validateSchedule(dto, rules);
    errors.push(...schedule.errors);
    errors.push(...validateConfiguredRequired(form, dto as unknown as Record<string, unknown>));
    const answers = validateFormAnswers(form, dto.formAnswers);
    errors.push(...answers.errors);

    const service = await this.prisma.service.findFirst({ where: { id: dto.serviceId, isActive: true, deletedAt: null } });
    if (!service) errors.push({ field: 'serviceId', message: 'Kategori acara tidak tersedia' });
    const pkg = dto.packageId
      ? await this.prisma.servicePackage.findFirst({
          where: { id: dto.packageId, isActive: true, deletedAt: null, OR: [{ serviceId: dto.serviceId }, { serviceId: null }] },
        })
      : null;
    if (dto.packageId && !pkg) errors.push({ field: 'packageId', message: 'Paket tidak tersedia untuk kategori ini' });
    if (errors.length) throw new BadRequestException({ statusCode: 400, message: 'Data pemesanan belum valid', errors });

    // 3. Jadwal Hari sudah terisi (termasuk jeda perjalanan)? Tidak membocorkan data booking lain.
    const bufferMs = rules.travelBufferMinutes * 60_000;
    const clash = await this.prisma.booking.findFirst({
      where: {
        status: { in: BLOCKING_STATUSES },
        deletedAt: null,
        eventStartAt: { lt: new Date(schedule.end.getTime() + bufferMs) },
        eventEndAt: { gt: new Date(schedule.start.getTime() - bufferMs) },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SLOT_UNAVAILABLE',
        message: 'Hari Susanto sudah memiliki jadwal di waktu tersebut. Silakan pilih tanggal atau jam lain.',
        errors: [{ field: 'startTime', message: 'Jadwal tidak tersedia' }],
      });
    }

    // 4. Snapshot harga saat booking. Tanpa paket → 0 = "menunggu konfirmasi harga" (tidak mengarang harga).
    const price = pkg ? pkg.price : new Prisma.Decimal(0);
    const whatsapp = normalizeIndonesianPhone(dto.contactWhatsapp);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const booking = await tx.booking.create({
            data: {
              code: generateBookingCode(),
              customerId: user.id,
              serviceId: dto.serviceId,
              packageId: pkg?.id,
              status: 'PENDING',
              idempotencyKey,
              eventStartAt: schedule.start,
              eventEndAt: schedule.end,
              timezone: dto.timezone,
              contactName: dto.contactName,
              contactEmail: dto.contactEmail.toLowerCase(),
              contactWhatsapp: whatsapp,
              packageName: pkg?.name,
              packagePrice: price,
              durationMinutes: pkg?.durationMinutes ?? Math.round((schedule.end.getTime() - schedule.start.getTime()) / 60_000),
              totalAmount: price,
              currency: pkg?.currency ?? 'IDR',
              formAnswers: answers.clean,
              privacyConsentAt: new Date(),
              eventDetail: {
                create: {
                  eventName: dto.eventName,
                  venueName: dto.venueName,
                  address: dto.address,
                  city: dto.city,
                  mapsUrl: dto.mapsUrl,
                  guestCount: dto.guestCount,
                  concept: dto.concept,
                  language: dto.language,
                  dressCode: dto.dressCode,
                  rundown: dto.rundown,
                  activityDescription: dto.activityDescription,
                  specialRequests: dto.specialRequests,
                  additionalNotes: dto.additionalNotes,
                },
              },
              statusLogs: {
                create: { toStatus: 'PENDING', action: 'SUBMIT', actorType: 'CUSTOMER', actorUserId: user.id },
              },
            },
          });

          // Lengkapi profil customer untuk autofill berikutnya (tidak menimpa data yang sudah ada).
          await tx.customerProfile.updateMany({ where: { userId: user.id, whatsapp: null }, data: { whatsapp } });
          await tx.customerProfile.updateMany({ where: { userId: user.id, city: null }, data: { city: dto.city } });

          await this.audit.log(
            {
              actorUserId: user.id,
              actorType: 'CUSTOMER',
              action: 'BOOKING_SUBMIT',
              entityType: 'booking',
              entityId: booking.id,
              metadata: { code: booking.code },
              meta,
            },
            tx,
          );

          const adminId = await this.notifications.adminUserId(tx);
          await this.notifications.enqueue(
            [
              {
                userId: user.id,
                type: 'BOOKING_SUBMITTED',
                title: 'Pesanan terkirim',
                body: `Pesanan ${booking.code} sudah diterima sistem dan menunggu konfirmasi Hari Susanto.`,
                data: { bookingId: booking.id, code: booking.code },
                dedupeKey: `booking:${booking.id}:SUBMITTED:${user.id}`,
              },
              ...(adminId
                ? [
                    {
                      userId: adminId,
                      type: 'ADMIN_NEW_BOOKING',
                      title: 'Pesanan baru',
                      body: `${dto.contactName} memesan untuk "${dto.eventName}" (${booking.code}).`,
                      data: { bookingId: booking.id, code: booking.code },
                      dedupeKey: `booking:${booking.id}:SUBMITTED:${adminId}`,
                    },
                  ]
                : []),
            ],
            tx,
          );
          return booking.id;
        });
        return { booking: await this.getForCustomer(user.id, id), replay: false };
      } catch (e) {
        // Dua submit paralel dengan key yang sama: yang kalah mengembalikan booking pemenang.
        if (isUniqueViolationOn(e, 'idempotency')) {
          const existing = await this.findIdByKey(user.id, idempotencyKey);
          if (existing) return { booking: await this.getForCustomer(user.id, existing), replay: true };
        }
        if (isUniqueViolationOn(e, 'code') && attempt < 2) continue; // tabrakan nomor booking → coba nomor lain
        throw e;
      }
    }
    throw new ConflictException('Gagal membuat nomor booking, silakan coba lagi');
  }

  private async findIdByKey(customerId: string, idempotencyKey: string): Promise<string | null> {
    const b = await this.prisma.booking.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      select: { id: true },
    });
    return b?.id ?? null;
  }

  // ───────────── Read (selalu dibatasi pemilik) ─────────────

  async getForCustomer(customerId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, customerId, deletedAt: null }, include: detailInclude });
    // 404 (bukan 403) agar keberadaan booking milik orang lain tidak bocor.
    if (!b) throw new NotFoundException('Pesanan tidak ditemukan');
    const view = this.toCustomerView(b);
    const [paymentSummary, payments] = await Promise.all([this.payments.summary(b.id), this.payments.listForBooking(b.id)]);
    // Cara bayar ditampilkan selama ada tagihan yang harus dibayar (DP atau pelunasan).
    const paymentInstructions = paymentSummary.dueNow > 0 ? await this.payments.instructions() : null;
    const reviewInvite = b.status === 'COMPLETED' ? await this.settings.googleReviewLink() : null;
    return { ...view, paymentSummary, payments, paymentInstructions, reviewInvite };
  }

  async listForCustomer(customerId: string, opts: { scope: ListScope; status?: BookingStatus; page: number; pageSize: number }) {
    const now = new Date();
    const where: Prisma.BookingWhereInput = { customerId, deletedAt: null };
    if (opts.scope === 'upcoming') Object.assign(where, { status: { in: ACTIVE_STATUSES }, eventEndAt: { gte: now } });
    if (opts.scope === 'past') where.OR = [{ status: { notIn: ACTIVE_STATUSES } }, { eventEndAt: { lt: now } }];
    if (opts.status) where.AND = [{ status: opts.status }];

    const orderBy: Prisma.BookingOrderByWithRelationInput = opts.scope === 'upcoming' ? { eventStartAt: 'asc' } : { createdAt: 'desc' };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { service: { select: { name: true } }, eventDetail: { select: { eventName: true, venueName: true, city: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: rows.map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        serviceName: b.service.name,
        eventName: b.eventDetail?.eventName ?? '',
        venueName: b.eventDetail?.venueName ?? '',
        city: b.eventDetail?.city ?? '',
        eventStartAt: b.eventStartAt,
        eventEndAt: b.eventEndAt,
        timezone: b.timezone,
        totalAmount: b.totalAmount,
        currency: b.currency,
        createdAt: b.createdAt,
      })),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  async summaryForCustomer(customerId: string) {
    const grouped = await this.prisma.booking.groupBy({
      by: ['status'],
      where: { customerId, deletedAt: null },
      _count: { _all: true },
    });
    const count = (s: BookingStatus[]) => grouped.filter((g) => s.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
    const next = await this.listForCustomer(customerId, { scope: 'upcoming', page: 1, pageSize: 1 });
    return {
      total: count(Object.values(BookingStatus)),
      active: count(ACTIVE_STATUSES),
      completed: count(['COMPLETED']),
      cancelled: count(['CANCELLED', 'REJECTED', 'REFUNDED']),
      nextEvent: next.items[0] ?? null,
    };
  }

  // ───────────── Cancel oleh customer ─────────────

  async cancelByCustomer(user: AuthUser, id: string, reason: string, meta: RequestMeta) {
    const booking = await this.prisma.booking.findFirst({ where: { id, customerId: user.id, deletedAt: null } });
    if (!booking) throw new NotFoundException('Pesanan tidak ditemukan');
    if (!findTransition(booking.status, 'CANCELLED', 'CUSTOMER')) {
      throw new ConflictException('Pesanan dengan status ini tidak dapat dibatalkan dari aplikasi. Silakan hubungi Hari Susanto.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update bersyarat pada status lama: aman dari perubahan status bersamaan oleh admin.
      const updated = await tx.booking.updateMany({
        where: { id, customerId: user.id, status: booking.status },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
      if (updated.count === 0) throw new ConflictException('Status pesanan baru saja berubah. Muat ulang halaman.');
      await tx.bookingStatusLog.create({
        data: { bookingId: id, fromStatus: booking.status, toStatus: 'CANCELLED', action: 'CANCEL', actorType: 'CUSTOMER', actorUserId: user.id, note: reason },
      });
      await this.audit.log(
        { actorUserId: user.id, actorType: 'CUSTOMER', action: 'BOOKING_CANCEL', entityType: 'booking', entityId: id, metadata: { from: booking.status, reason }, meta },
        tx,
      );
      const adminId = await this.notifications.adminUserId(tx);
      await this.notifications.enqueue(
        [
          {
            userId: user.id,
            type: 'BOOKING_CANCELLED',
            title: 'Pesanan dibatalkan',
            body: `Pesanan ${booking.code} telah dibatalkan.`,
            data: { bookingId: id, code: booking.code },
            dedupeKey: `booking:${id}:CANCELLED:${user.id}`,
          },
          ...(adminId
            ? [
                {
                  userId: adminId,
                  type: 'ADMIN_BOOKING_CANCELLED_BY_CUSTOMER',
                  title: 'Pesanan dibatalkan pelanggan',
                  body: `${booking.contactName} membatalkan ${booking.code}. Alasan: ${reason}`,
                  data: { bookingId: id, code: booking.code },
                  dedupeKey: `booking:${id}:CANCELLED:${adminId}`,
                },
              ]
            : []),
        ],
        tx,
      );
    });
    return this.getForCustomer(user.id, id);
  }

  // ───────────── Mapping ─────────────

  private toCustomerView(b: BookingWithDetail) {
    const e = b.eventDetail;
    return {
      id: b.id,
      code: b.code,
      status: b.status,
      allowedActions: customerActions(b.status),
      service: b.service,
      schedule: {
        start: b.eventStartAt,
        end: b.eventEndAt,
        timezone: b.timezone,
        durationMinutes: Math.round((b.eventEndAt.getTime() - b.eventStartAt.getTime()) / 60_000),
      },
      contact: { name: b.contactName, email: b.contactEmail, whatsapp: b.contactWhatsapp },
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
        transportFee: b.transportFee,
        additionalFee: b.additionalFee,
        additionalFeeNote: b.additionalFeeNote,
        discountAmount: b.discountAmount,
        totalAmount: b.totalAmount,
        depositAmount: b.depositAmount,
        currency: b.currency,
        /** false → harga belum ditetapkan; tampilkan "menunggu konfirmasi", jangan Rp 0. */
        hasPrice: b.totalAmount.gt(0),
      },
      formAnswers: b.formAnswers,
      cancellationReason: b.cancellationReason,
      rejectionReason: b.rejectionReason,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      timeline: b.statusLogs,
    };
  }
}
