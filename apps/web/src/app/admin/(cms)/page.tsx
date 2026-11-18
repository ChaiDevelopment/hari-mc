'use client';

import { AlertTriangle, Bell, CalendarClock, CheckCircle2, ClipboardList, Hourglass, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { BookingTable } from '@/components/admin/booking-table';
import { StatCard } from '@/components/admin/feedback';
import { Alert, Button, Card, EmptyState, LinkButton, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { AdminDashboard } from '@/lib/admin-types';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/format';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<AdminDashboard>('/admin/dashboard')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat dashboard'));
  }, []);
  useEffect(load, [load]);

  if (error)
    return (
      <Alert tone="error" title="Dashboard tidak dapat dimuat">
        {error}{' '}
        <button className="font-semibold underline" onClick={load}>
          Coba lagi
        </button>
      </Alert>
    );
  if (!data) return <Spinner />;

  const s = data.counts.byStatus;
  // Agenda dikelompokkan per tanggal (WIB)
  const groups = new Map<string, AdminDashboard['agenda']>();
  for (const a of data.agenda) {
    const key = formatDate(a.eventStartAt, a.timezone);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  return (
    <>
      <PageHeader eyebrow="Dashboard" title="Selamat datang, Hari Susanto" actions={<LinkButton href="/admin/pesanan?status=PENDING">Tinjau pesanan baru</LinkButton>}>
        Ringkasan bisnis langsung dari database.
      </PageHeader>

      {data.counts.pendingPayments > 0 && (
        <Alert className="mb-6" title={`${data.counts.pendingPayments} bukti pembayaran menunggu verifikasi`}>
          Buka pesanan bertanda “Bukti bayar” lalu verifikasi atau tolak. <Link href="/admin/pesanan?status=WAITING_PAYMENT" className="font-semibold underline">Lihat pesanan menunggu bayar</Link>
        </Alert>
      )}
      {data.counts.pendingWithConflict > 0 && (
        <Alert tone="error" className="mb-6" title={`${data.counts.pendingWithConflict} pesanan menunggu bentrok dengan jadwal yang sudah terkunci`}>
          Pesanan tersebut tidak dapat diterima tanpa mengubah jadwal. <Link href="/admin/kalender" className="font-semibold underline">Lihat kalender</Link>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-testid="admin-stats">
        <StatCard label="Total booking" value={data.counts.total} tone="navy" icon={<ClipboardList className="size-4" />} />
        <StatCard label="Menunggu persetujuan" value={s.PENDING} tone={s.PENDING ? 'gold' : 'default'} icon={<Hourglass className="size-4" />} />
        <StatCard label="Diterima" value={s.ACCEPTED} />
        <StatCard label="Menunggu bayar" value={s.WAITING_PAYMENT} icon={<Wallet className="size-4" />} />
        <StatCard label="Terkonfirmasi" value={s.CONFIRMED} />
        <StatCard label="Selesai" value={s.COMPLETED} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Acara mendatang" value={data.counts.upcoming} hint="Jadwal terkunci" icon={<CalendarClock className="size-4" />} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="recent-h" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-h" className="font-display text-xl text-navy-900">Booking terbaru</h2>
            <Link href="/admin/pesanan" className="text-sm font-semibold text-gold-700 hover:text-navy-900">
              Semua pesanan
            </Link>
          </div>
          {data.recent.length ? (
            <BookingTable rows={data.recent} />
          ) : (
            <EmptyState icon={<ClipboardList className="size-5" />} title="Belum ada pesanan">
              Pesanan dari website akan muncul di sini.
            </EmptyState>
          )}
        </section>

        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl text-navy-900">Agenda 14 hari</h2>
              <Link href="/admin/kalender" className="text-sm font-semibold text-gold-700 hover:text-navy-900">
                Kalender
              </Link>
            </div>
            {groups.size === 0 ? (
              <p className="text-sm text-muted">Tidak ada acara dalam 14 hari ke depan.</p>
            ) : (
              <div className="space-y-4" data-testid="agenda">
                {[...groups.entries()].map(([day, items]) => (
                  <div key={day}>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{day}</p>
                    <ul className="mt-2 space-y-2">
                      {items.map((a) => (
                        <li key={a.id}>
                          <Link href={`/admin/pesanan/${a.id}`} className="flex items-start gap-3 rounded-xl border border-line p-3 hover:border-gold-400">
                            <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${a.blocking ? 'bg-gold-500' : 'border border-dashed border-amber-400'}`} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-navy-900">{formatTimeRange(a.eventStartAt, a.eventEndAt, a.timezone)}</span>
                              <span className="block truncate text-sm text-muted">
                                {a.eventName} · {a.contactName}
                              </span>
                            </span>
                            <StatusBadge status={a.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-xl text-navy-900">
                <Bell className="size-4 text-gold-600" aria-hidden /> Aktivitas
                {data.notifications.unread > 0 && <span className="rounded-full bg-gold-500 px-2 py-0.5 font-sans text-xs font-bold text-navy-950">{data.notifications.unread}</span>}
              </h2>
              {data.notifications.unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api('/notifications/read-all', { method: 'POST' });
                    load();
                  }}
                >
                  Tandai dibaca
                </Button>
              )}
            </div>
            {data.notifications.items.length ? (
              <ul className="space-y-3">
                {data.notifications.items.map((n) => (
                  <li key={n.id}>
                    <Link href={n.data.bookingId ? `/admin/pesanan/${n.data.bookingId}` : '/admin'} className="block rounded-xl border border-line p-3 hover:border-gold-400">
                      <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                        {!n.readAt && <span className="size-2 rounded-full bg-gold-500" aria-label="Belum dibaca" />}
                        {n.type.includes('CANCEL') && <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />}
                        {n.title}
                      </p>
                      <p className="mt-1 text-sm text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted/80">{formatDateTime(n.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Belum ada aktivitas.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
