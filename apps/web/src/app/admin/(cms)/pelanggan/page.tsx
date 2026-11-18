'use client';

import { ChevronRight, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { Avatar } from '@/components/site-header';
import { Alert, Button, EmptyState, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { AdminCustomerRow } from '@/lib/admin-types';
import { formatPhone, formatRupiah, formatShortDate } from '@/lib/format';
import type { Paginated } from '@/lib/types';

export default function CustomersPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminCustomerRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(query ? { q: query } : {}) });
    api<Paginated<AdminCustomerRow>>(`/admin/customers?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Gagal memuat pelanggan'));
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(q.trim());
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader eyebrow="Pelanggan" title="Data pelanggan">
        Pelanggan yang pernah masuk ke website.
      </PageHeader>
      <form onSubmit={submit} role="search" className="relative mb-6 max-w-lg">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" className="field-input pl-10" placeholder="Cari nama, email, atau nomor WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pelanggan" />
      </form>

      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && data.items.length === 0 && (
        <EmptyState icon={<Users className="size-5" />} title={query ? 'Tidak ditemukan' : 'Belum ada pelanggan'}>
          {query ? `Tidak ada pelanggan yang cocok dengan “${query}”.` : 'Pelanggan akan muncul setelah login pertama di website.'}
        </EmptyState>
      )}
      {data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted">{data.total} pelanggan</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            {data.items.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/pelanggan/${c.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-cream-50 sm:px-5" data-testid="customer-row">
                  <Avatar name={c.name} url={c.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy-900">{c.name}</p>
                    <p className="truncate text-sm text-muted">
                      {c.email}
                      {c.whatsapp ? ` · ${formatPhone(c.whatsapp)}` : ''}
                      {c.city ? ` · ${c.city}` : ''}
                    </p>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <p className="font-semibold text-navy-900">{c.bookingCount} pesanan</p>
                    <p className="text-xs text-muted">{c.lastBookingAt ? `Terakhir ${formatShortDate(c.lastBookingAt)}` : `Bergabung ${formatShortDate(c.createdAt)}`}</p>
                  </div>
                  <div className="hidden w-32 text-right text-sm lg:block">
                    <p className="text-xs text-muted">Terverifikasi</p>
                    <p className="font-semibold text-navy-900">{formatRupiah(c.totalVerifiedPayments)}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Halaman" className="mt-6 flex items-center justify-center gap-3">
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
    </>
  );
}
