'use client';

import { ArrowLeft, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { BookingTable } from '@/components/admin/booking-table';
import { StatCard } from '@/components/admin/feedback';
import { Avatar } from '@/components/site-header';
import { Alert, Card, EmptyState, LinkButton, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { AdminCustomerDetail } from '@/lib/admin-types';
import { formatDateTime, formatPhone, formatRupiah, formatShortDate } from '@/lib/format';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<AdminCustomerDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    api<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(id)}`)
      .then(setC)
      .catch((e) => setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: 'Gagal memuat' }));
  }, [id]);

  if (error)
    return error.status === 404 || error.status === 400 ? (
      <EmptyState title="Pelanggan tidak ditemukan" action={<LinkButton href="/admin/pelanggan">Kembali</LinkButton>} />
    ) : (
      <Alert tone="error">{error.message}</Alert>
    );
  if (!c) return <Spinner />;

  return (
    <>
      <Link href="/admin/pelanggan" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua pelanggan
      </Link>
      <PageHeader eyebrow="Pelanggan" title={c.name}>
        Bergabung {formatShortDate(c.createdAt)}
        {c.lastLoginAt ? ` · login terakhir ${formatDateTime(c.lastLoginAt)}` : ''}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card className="h-fit p-6">
          <div className="flex items-center gap-4">
            <Avatar name={c.name} url={c.avatarUrl} size="lg" />
            <p className="font-display text-xl text-navy-900">{c.name}</p>
          </div>
          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex items-center gap-2 break-all">
              <Mail className="size-4 shrink-0 text-gold-600" aria-hidden /> {c.email}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 text-gold-600" aria-hidden /> {c.whatsapp ? formatPhone(c.whatsapp) : <span className="text-muted">Belum diisi</span>}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-gold-600" aria-hidden /> {c.city ?? <span className="text-muted">Belum diisi</span>}
            </li>
          </ul>
          {c.whatsapp && (
            <a
              href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <MessageCircle className="size-4" aria-hidden /> Chat WhatsApp
            </a>
          )}
        </Card>

        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total pesanan" value={c.stats.bookingCount} tone="navy" />
            <StatCard label="Aktif" value={c.stats.active} />
            <StatCard label="Selesai" value={c.stats.completed} />
            <StatCard label="Pembayaran terverifikasi" value={<span className="text-xl">{formatRupiah(c.stats.totalVerifiedPayments)}</span>} />
          </div>
          <section>
            <h2 className="mb-3 font-display text-xl text-navy-900">Riwayat pesanan</h2>
            {c.bookings.length ? <BookingTable rows={c.bookings} /> : <EmptyState title="Belum ada pesanan" />}
          </section>
        </div>
      </div>
    </>
  );
}
