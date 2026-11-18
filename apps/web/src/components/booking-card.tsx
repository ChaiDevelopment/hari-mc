import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatTimeRange } from '@/lib/format';
import type { BookingListItem } from '@/lib/types';
import { StatusBadge } from './ui';

export function BookingCard({ booking }: { booking: BookingListItem }) {
  return (
    <Link
      href={`/akun/pesanan/${booking.id}`}
      data-testid="booking-card"
      className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-soft transition hover:border-gold-400 hover:shadow-lift"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <span className="font-mono text-xs text-muted">{booking.code}</span>
        </div>
        <p className="mt-3 truncate font-display text-lg text-navy-900">{booking.eventName}</p>
        <p className="text-sm text-muted">{booking.serviceName}</p>
        <div className="mt-3 flex flex-col gap-1.5 text-sm text-navy-800 sm:flex-row sm:gap-5">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-gold-600" aria-hidden />
            {formatDate(booking.eventStartAt, booking.timezone)} · {formatTimeRange(booking.eventStartAt, booking.eventEndAt, booking.timezone)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-4 shrink-0 text-gold-600" aria-hidden />
            <span className="truncate">
              {booking.venueName}, {booking.city}
            </span>
          </span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-gold-600" aria-hidden />
    </Link>
  );
}
