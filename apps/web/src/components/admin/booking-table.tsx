import { AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatRupiah, formatShortDate, formatTimeRange } from '@/lib/format';
import type { AdminBookingRow } from '@/lib/admin-types';
import { StatusBadge } from '../ui';

/** Tabel di desktop, kartu di mobile — tanpa scroll horizontal. */
export function BookingTable({ rows, showPrice = true, conflictIds }: { rows: AdminBookingRow[]; showPrice?: boolean; conflictIds?: Set<string> }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-white shadow-soft md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-100 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Booking</th>
              <th scope="col" className="px-4 py-3 font-semibold">Pelanggan & acara</th>
              <th scope="col" className="px-4 py-3 font-semibold">Jadwal</th>
              {showPrice && <th scope="col" className="hidden px-4 py-3 text-right font-semibold xl:table-cell">Total</th>}
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((b) => (
              <tr key={b.id} className="group relative hover:bg-cream-50" data-testid="admin-booking-row">
                <td className="px-4 py-3.5">
                  <Link href={`/admin/pesanan/${b.id}`} className="font-mono text-xs font-semibold text-navy-900 after:absolute after:inset-0">
                    {b.code}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">{b.serviceName}</p>
                </td>
                <td className="max-w-[16rem] px-4 py-3.5">
                  <p className="truncate font-semibold text-navy-900">{b.contactName}</p>
                  <p className="truncate text-xs text-muted">{b.eventName}</p>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <p className="font-medium text-navy-900">{formatShortDate(b.eventStartAt, b.timezone)}</p>
                  <p className="text-xs text-muted">{formatTimeRange(b.eventStartAt, b.eventEndAt, b.timezone)}</p>
                </td>
                {showPrice && (
                  <td className="hidden px-4 py-3.5 text-right whitespace-nowrap xl:table-cell">
                    {Number(b.totalAmount) > 0 ? formatRupiah(b.totalAmount) : <span className="text-xs text-muted">Belum ditetapkan</span>}
                  </td>
                )}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    {conflictIds?.has(b.id) && <AlertTriangle className="size-4 text-amber-600" aria-label="Jadwal bentrok" />}
                    {(b.pendingPayments ?? 0) > 0 && <span className="rounded-full bg-gold-500 px-2 py-0.5 text-[0.65rem] font-bold text-navy-950">Bukti bayar</span>}
                  </div>
                </td>
                <td className="pr-4">
                  <ChevronRight className="size-4 text-muted group-hover:text-gold-600" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((b) => (
          <li key={b.id}>
            <Link href={`/admin/pesanan/${b.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-soft" data-testid="admin-booking-row">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-navy-900">{b.code}</span>
                <span className="flex items-center gap-1.5">
                  {(b.pendingPayments ?? 0) > 0 && <span className="rounded-full bg-gold-500 px-2 py-0.5 text-[0.65rem] font-bold text-navy-950">Bukti bayar</span>}
                  <StatusBadge status={b.status} />
                </span>
              </div>
              <p className="mt-2 font-semibold text-navy-900">{b.contactName}</p>
              <p className="text-sm text-muted">{b.eventName}</p>
              <p className="mt-2 text-sm text-navy-800">
                {formatShortDate(b.eventStartAt, b.timezone)} · {formatTimeRange(b.eventStartAt, b.eventEndAt, b.timezone)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
