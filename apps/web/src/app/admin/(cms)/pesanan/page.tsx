'use client';

import clsx from 'clsx';
import { ClipboardList, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { BookingTable } from '@/components/admin/booking-table';
import { Alert, Button, EmptyState, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { AdminBookingList } from '@/lib/admin-types';
import { STATUS_META } from '@/lib/format';
import type { BookingStatus, Service } from '@/lib/types';

const TABS: Array<{ id: string; label: string; statuses: BookingStatus[] }> = [
  { id: 'all', label: 'Semua', statuses: [] },
  { id: 'PENDING', label: 'Baru / Menunggu', statuses: ['PENDING'] },
  { id: 'ACCEPTED', label: 'Diterima', statuses: ['ACCEPTED'] },
  { id: 'WAITING_PAYMENT', label: 'Menunggu Bayar', statuses: ['WAITING_PAYMENT'] },
  { id: 'CONFIRMED', label: 'Terkonfirmasi', statuses: ['CONFIRMED'] },
  { id: 'IN_PROGRESS', label: 'Berlangsung', statuses: ['IN_PROGRESS'] },
  { id: 'COMPLETED', label: 'Selesai', statuses: ['COMPLETED'] },
  { id: 'CLOSED', label: 'Batal / Ditolak', statuses: ['CANCELLED', 'REJECTED', 'REFUNDED'] },
];

function BookingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<AdminBookingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [q, setQ] = useState(params.get('q') ?? '');

  const status = params.get('status') ?? '';
  const tab = TABS.find((t) => t.statuses.join(',') === status) ?? TABS[0];
  const page = Number(params.get('page') ?? '1') || 1;

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    api<Array<Service & { isActive: boolean }>>('/admin/services').then(setServices).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const qs = new URLSearchParams(params.toString());
    if (!qs.get('pageSize')) qs.set('pageSize', '20');
    api<AdminBookingList>(`/admin/bookings?${qs.toString()}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Gagal memuat pesanan'));
    return () => {
      cancelled = true;
    };
  }, [params]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setParam({ q: q.trim() || null });
  };

  const counts = data?.statusCounts;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilter = !!(params.get('q') || params.get('serviceId') || params.get('dateFrom') || params.get('dateTo'));

  return (
    <>
      <PageHeader eyebrow="Pesanan" title="Manajemen booking">
        Cari, saring, dan tindak lanjuti semua pesanan.
      </PageHeader>

      <div role="tablist" aria-label="Status" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((t) => {
          const n = counts ? (t.statuses.length ? t.statuses.reduce((a, s) => a + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0)) : null;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab.id === t.id}
              onClick={() => setParam({ status: t.statuses.join(',') || null })}
              className={clsx(
                'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                tab.id === t.id ? 'border-navy-900 bg-navy-900 text-cream-50' : 'border-line bg-white text-navy-800 hover:border-gold-400',
              )}
            >
              {t.label}
              {n !== null && <span className={clsx('rounded-full px-1.5 text-xs', tab.id === t.id ? 'bg-gold-500 text-navy-950' : 'bg-cream-200 text-navy-800')}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft md:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
        <form onSubmit={onSearch} className="relative" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            className="field-input pl-10"
            placeholder="Nama, nomor booking, WA…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari pesanan"
          />
        </form>
        <select className="field-input" aria-label="Kategori acara" value={params.get('serviceId') ?? ''} onChange={(e) => setParam({ serviceId: e.target.value || null })}>
          <option value="">Semua kategori</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="df">
          Dari tanggal
        </label>
        <input id="df" type="date" className="field-input" value={params.get('dateFrom') ?? ''} onChange={(e) => setParam({ dateFrom: e.target.value || null })} title="Tanggal acara dari" />
        <label className="sr-only" htmlFor="dt">
          Sampai tanggal
        </label>
        <input id="dt" type="date" className="field-input" value={params.get('dateTo') ?? ''} onChange={(e) => setParam({ dateTo: e.target.value || null })} title="Tanggal acara sampai" />
        <select className="field-input" aria-label="Urutkan" value={params.get('sort') ?? 'created_desc'} onChange={(e) => setParam({ sort: e.target.value === 'created_desc' ? null : e.target.value })}>
          <option value="created_desc">Terbaru masuk</option>
          <option value="event_asc">Tanggal acara terdekat</option>
          <option value="event_desc">Tanggal acara terjauh</option>
        </select>
      </div>
      {hasFilter && (
        <button
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700 hover:text-navy-900"
          onClick={() => {
            setQ('');
            setParam({ q: null, serviceId: null, dateFrom: null, dateTo: null });
          }}
        >
          <X className="size-4" aria-hidden /> Hapus filter
        </button>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && (
        <EmptyState icon={<ClipboardList className="size-5" />} title="Tidak ada pesanan">
          {hasFilter || tab.id !== 'all' ? 'Tidak ada pesanan yang cocok dengan filter.' : 'Pesanan dari website akan muncul di sini.'}
        </EmptyState>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted" data-testid="result-count">
            {data.total} pesanan{tab.statuses.length === 1 ? ` · ${STATUS_META[tab.statuses[0]].label}` : ''}
          </p>
          <BookingTable rows={data.items} />
          {pages > 1 && (
            <nav aria-label="Halaman" className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
                Sebelumnya
              </Button>
              <span className="text-sm text-muted">
                {page} / {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
                Berikutnya
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <BookingsPage />
    </Suspense>
  );
}
