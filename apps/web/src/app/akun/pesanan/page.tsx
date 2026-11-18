'use client';

import clsx from 'clsx';
import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BookingCard } from '@/components/booking-card';
import { Alert, Button, Container, EmptyState, LinkButton, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { BookingListItem, Paginated } from '@/lib/types';

const SCOPES = [
  { id: 'all', label: 'Semua' },
  { id: 'upcoming', label: 'Mendatang' },
  { id: 'past', label: 'Riwayat' },
] as const;
type Scope = (typeof SCOPES)[number]['id'];
const PAGE_SIZE = 10;

export default function BookingHistoryPage() {
  const [scope, setScope] = useState<Scope>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<BookingListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api<Paginated<BookingListItem>>(`/bookings?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Gagal memuat pesanan'));
    return () => {
      cancelled = true;
    };
  }, [scope, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Container className="pt-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Pesanan</p>
          <h1 className="mt-2 font-display text-3xl text-navy-900 sm:text-4xl">Riwayat pesanan</h1>
        </div>
        <div role="tablist" aria-label="Filter pesanan" className="inline-flex rounded-full border border-line bg-white p-1">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={scope === s.id}
              onClick={() => {
                setScope(s.id);
                setPage(1);
              }}
              className={clsx('rounded-full px-4 py-1.5 text-sm font-semibold transition', scope === s.id ? 'bg-navy-900 text-cream-50' : 'text-muted hover:text-navy-900')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {error && <Alert tone="error">{error}</Alert>}
        {!data && !error && <Spinner />}
        {data && data.items.length === 0 && (
          <EmptyState icon={<ClipboardList className="size-5" />} title={scope === 'upcoming' ? 'Tidak ada acara mendatang' : 'Belum ada pesanan'} action={<LinkButton href="/pesan">Pesan MC</LinkButton>}>
            Pesanan yang Anda kirim akan tercatat di sini beserta statusnya.
          </EmptyState>
        )}
        {data && data.items.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted">{data.total} pesanan</p>
            <div className="space-y-3">
              {data.items.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
            {pages > 1 && (
              <nav aria-label="Halaman" className="mt-8 flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted">
                  {page} / {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Berikutnya
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </Container>
  );
}
