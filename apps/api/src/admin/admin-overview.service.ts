import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { BLOCKING_STATUSES } from '../bookings/booking-status';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { CalendarQuery, CustomerQuery } from './dto/admin-bookings.dto';

const ACTIVE: BookingStatus[] = ['PENDING', ...BLOCKING_STATUSES];
const MAX_CALENDAR_DAYS = 100;

const listSelect = {
  id: true,
  code: true,
  status: true,
  contactName: true,
  eventStartAt: true,
  eventEndAt: true,
  timezone: true,
  totalAmount: true,
  createdAt: true,
  service: { select: { name: true } },
  eventDetail: { select: { eventName: true, venueName: true, city: true } },
} satisfies Prisma.BookingSelect;

type ListRow = Prisma.BookingGetPayload<{ select: typeof listSelect }>;
const flat = (b: ListRow) => ({
  id: b.id,
  code: b.code,
  status: b.status,
  contactName: b.contactName,
  serviceName: b.service.name,
  eventName: b.eventDetail?.eventName ?? '',
  venueName: b.eventDetail?.venueName ?? '',
  city: b.eventDetail?.city ?? '',
  eventStartAt: b.eventStartAt,
  eventEndAt: b.eventEndAt,
  timezone: b.timezone,
  totalAmount: b.totalAmount,
  createdAt: b.createdAt,
});

interface Interval {
  id: string;
  start: number;
  end: number;
  blocking: boolean;
  code: string;
}

/** Pasangan yang bertabrakan (termasuk jeda perjalanan). Pasangan PENDING–PENDING diabaikan: keduanya belum mengunci jadwal. */
export function detectConflicts(items: Interval[], bufferMs: number) {
  const result = new Map<string, Array<{ id: string; code: string; type: 'OVERLAP' | 'BUFFER' }>>();
  const sorted = [...items].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (b.start >= a.end + bufferMs) break;
      if (!a.blocking && !b.blocking) continue;
      const overlap = b.start < a.end && b.end > a.start;
      const near = b.start < a.end + bufferMs && b.end + bufferMs > a.start;
      if (!overlap && !near) continue;
      const type = overlap ? 'OVERLAP' : 'BUFFER';
      if (!result.has(a.id)) result.set(a.id, []);
      if (!result.has(b.id)) result.set(b.id, []);
      result.get(a.id)!.push({ id: b.id, code: b.code, type });
      result.get(b.id)!.push({ id: a.id, code: a.code, type });
    }
  }
  return result;
}

@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Dashboard (semua angka dari database) ─────────────

  async dashboard(adminId: string) {
    const now = new Date();
    const in14 = new Date(now.getTime() + 14 * 86_400_000);
    const rules = await this.settings.bookingRules();
    const [grouped, upcomingCount, upcoming, recent, agendaRows, notifications] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.booking.count({ where: { deletedAt: null, status: { in: BLOCKING_STATUSES }, eventEndAt: { gte: now } } }),
      this.prisma.booking.findMany({
        where: { deletedAt: null, status: { in: BLOCKING_STATUSES }, eventEndAt: { gte: now } },
        orderBy: { eventStartAt: 'asc' },
        take: 5,
        select: listSelect,
      }),
      this.prisma.booking.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 6, select: listSelect }),
      this.prisma.booking.findMany({
        where: { deletedAt: null, status: { in: ACTIVE }, eventEndAt: { gte: now }, eventStartAt: { lt: in14 } },
        orderBy: { eventStartAt: 'asc' },
        select: listSelect,
      }),
      this.notifications.list(adminId, 1, 6),
    ]);
    const byStatus = Object.fromEntries(Object.values(BookingStatus).map((s) => [s, 0])) as Record<BookingStatus, number>;
    for (const g of grouped) byStatus[g.status] = g._count._all;

    // PENDING mendatang yang bentrok dengan jadwal terkunci → perlu perhatian sebelum diterima
    const futurePending = await this.prisma.booking.findMany({
      where: { deletedAt: null, status: 'PENDING', eventStartAt: { gte: now } },
      select: { id: true, code: true, eventStartAt: true, eventEndAt: true },
    });
    let pendingWithConflict = 0;
    if (futurePending.length) {
      const blocking = await this.prisma.booking.findMany({
        where: { deletedAt: null, status: { in: BLOCKING_STATUSES }, eventEndAt: { gte: now } },
        select: { id: true, code: true, eventStartAt: true, eventEndAt: true },
      });
      const conflicts = detectConflicts(
        [
          ...futurePending.map((b) => ({ id: b.id, code: b.code, start: +b.eventStartAt, end: +b.eventEndAt, blocking: false })),
          ...blocking.map((b) => ({ id: b.id, code: b.code, start: +b.eventStartAt, end: +b.eventEndAt, blocking: true })),
        ],
        rules.travelBufferMinutes * 60_000,
      );
      pendingWithConflict = futurePending.filter((p) => conflicts.has(p.id)).length;
    }

    return {
      counts: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus,
        upcoming: upcomingCount,
        pendingWithConflict,
        pendingPayments: await this.prisma.payment.count({ where: { status: 'PENDING', booking: { deletedAt: null } } }),
      },
      upcoming: upcoming.map(flat),
      recent: recent.map(flat),
      agenda: agendaRows.map((b) => ({ ...flat(b), blocking: BLOCKING_STATUSES.includes(b.status) })),
      notifications,
    };
  }

  // ───────────── Kalender ─────────────

  async calendar(q: CalendarQuery) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (Number.isNaN(+from) || Number.isNaN(+to) || to <= from) throw new BadRequestException('Rentang tanggal tidak valid');
    if (+to - +from > MAX_CALENDAR_DAYS * 86_400_000) throw new BadRequestException(`Rentang maksimal ${MAX_CALENDAR_DAYS} hari`);

    const rules = await this.settings.bookingRules();
    const bufferMs = rules.travelBufferMinutes * 60_000;
    const rows = await this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        ...(q.status?.length ? { status: { in: q.status } } : {}),
        eventStartAt: { lt: new Date(+to + bufferMs) },
        eventEndAt: { gt: new Date(+from - bufferMs) },
      },
      orderBy: { eventStartAt: 'asc' },
      select: listSelect,
    });

    // Konflik dihitung terhadap SEMUA booking aktif di sekitar rentang, bukan hanya yang lolos filter status.
    const active = await this.prisma.booking.findMany({
      where: { deletedAt: null, status: { in: ACTIVE }, eventStartAt: { lt: new Date(+to + 2 * bufferMs) }, eventEndAt: { gt: new Date(+from - 2 * bufferMs) } },
      select: { id: true, code: true, status: true, eventStartAt: true, eventEndAt: true },
    });
    const conflicts = detectConflicts(
      active.map((b) => ({ id: b.id, code: b.code, start: +b.eventStartAt, end: +b.eventEndAt, blocking: BLOCKING_STATUSES.includes(b.status) })),
      bufferMs,
    );

    return {
      travelBufferMinutes: rules.travelBufferMinutes,
      events: rows.map((b) => ({
        ...flat(b),
        blocking: BLOCKING_STATUSES.includes(b.status),
        conflicts: conflicts.get(b.id) ?? [],
      })),
    };
  }

  // ───────────── Pelanggan ─────────────

  async customers(q: CustomerQuery) {
    const where: Prisma.UserWhereInput = { role: 'CUSTOMER', deletedAt: null };
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      const phone = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
        ...(phone.length >= 4 ? [{ customerProfile: { whatsapp: { contains: phone } } }] : []),
      ];
    }
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
          customerProfile: { select: { whatsapp: true, city: true } },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const ids = users.map((u) => u.id);
    const [last, paid] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, deletedAt: null }, _max: { createdAt: true } }),
      this.verifiedTotals(ids),
    ]);
    const lastMap = new Map(last.map((l) => [l.customerId, l._max.createdAt]));
    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        whatsapp: u.customerProfile?.whatsapp ?? null,
        city: u.customerProfile?.city ?? null,
        createdAt: u.createdAt,
        bookingCount: u._count.bookings,
        lastBookingAt: lastMap.get(u.id) ?? null,
        totalVerifiedPayments: (paid.get(u.id) ?? 0).toString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async customer(id: string) {
    const u = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER', deletedAt: null },
      // Hanya data yang dibutuhkan untuk melayani pesanan — tanpa google_sub, token, IP, atau catatan teknis.
      select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true, lastLoginAt: true, customerProfile: { select: { whatsapp: true, city: true, notes: true } } },
    });
    if (!u) throw new NotFoundException('Pelanggan tidak ditemukan');
    const [bookings, paid] = await Promise.all([
      this.prisma.booking.findMany({ where: { customerId: id, deletedAt: null }, orderBy: { eventStartAt: 'desc' }, select: listSelect }),
      this.verifiedTotals([id]),
    ]);
    const count = (s: BookingStatus[]) => bookings.filter((b) => s.includes(b.status)).length;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      whatsapp: u.customerProfile?.whatsapp ?? null,
      city: u.customerProfile?.city ?? null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      stats: {
        bookingCount: bookings.length,
        active: count(ACTIVE),
        completed: count(['COMPLETED']),
        cancelled: count(['CANCELLED', 'REJECTED', 'REFUNDED']),
        totalVerifiedPayments: (paid.get(id) ?? 0).toString(),
      },
      bookings: bookings.map(flat),
    };
  }

  /** Total pembayaran terverifikasi (DP + pelunasan − refund) per pelanggan. */
  private async verifiedTotals(customerIds: string[]): Promise<Map<string, number>> {
    if (!customerIds.length) return new Map();
    const payments = await this.prisma.payment.findMany({
      where: { status: 'VERIFIED', booking: { customerId: { in: customerIds } } },
      select: { amount: true, type: true, booking: { select: { customerId: true } } },
    });
    const map = new Map<string, number>();
    for (const p of payments) {
      const sign = p.type === 'REFUND' ? -1 : 1;
      map.set(p.booking.customerId, (map.get(p.booking.customerId) ?? 0) + sign * Number(p.amount));
    }
    return map;
  }
}
