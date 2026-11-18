'use client';

import { CalendarDays, CheckCircle2, Copy, MapPin } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { Alert, Button, Card, Container, LinkButton, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatTimeRange } from '@/lib/format';
import type { BookingDetail } from '@/lib/types';

function Success() {
  const id = useSearchParams().get('id');
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return setError('Nomor pesanan tidak ditemukan');
    api<BookingDetail>(`/bookings/${encodeURIComponent(id)}`)
      .then(setBooking)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat pesanan'));
  }, [id]);

  const copy = async () => {
    if (!booking) return;
    try {
      await navigator.clipboard.writeText(booking.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  if (error) {
    return (
      <Container className="py-16">
        <Alert tone="error" title="Pesanan tidak dapat ditampilkan">
          {error}
        </Alert>
        <LinkButton href="/akun/pesanan" className="mt-6">
          Lihat pesanan saya
        </LinkButton>
      </Container>
    );
  }
  if (!booking) return <Spinner />;

  return (
    <Container className="max-w-xl py-12 sm:py-16">
      <Card className="overflow-hidden text-center">
        <div className="bg-navy-900 px-6 pt-10 pb-8 text-cream-50">
          <CheckCircle2 className="mx-auto size-14 text-gold-400" aria-hidden />
          <h1 className="mt-4 font-display text-3xl">Pesanan terkirim!</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-cream-200/80">
            Terima kasih. Hari Susanto akan meninjau jadwal dan kebutuhan acara Anda. Status terbaru dapat dipantau dari halaman Akun.
          </p>
        </div>
        <div className="px-6 py-8">
          <p className="text-sm text-muted">Nomor booking Anda</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="font-mono text-2xl font-semibold tracking-wider text-navy-900 sm:text-3xl" data-testid="booking-code">
              {booking.code}
            </p>
            <button onClick={copy} className="rounded-full p-2 text-muted hover:bg-cream-100 hover:text-navy-900" aria-label="Salin nomor booking">
              <Copy className="size-4" />
            </button>
          </div>
          {copied && <p className="mt-1 text-xs text-emerald-700">Disalin</p>}
          <div className="mt-4">
            <StatusBadge status={booking.status} />
          </div>
          <div className="mx-auto mt-6 max-w-sm space-y-2 rounded-xl bg-cream-100 p-4 text-left text-sm">
            <p className="font-semibold text-navy-900">{booking.event?.eventName}</p>
            <p className="flex items-center gap-2 text-navy-800">
              <CalendarDays className="size-4 text-gold-600" aria-hidden />
              {formatDate(booking.schedule.start, booking.schedule.timezone)} · {formatTimeRange(booking.schedule.start, booking.schedule.end, booking.schedule.timezone)}
            </p>
            <p className="flex items-center gap-2 text-navy-800">
              <MapPin className="size-4 text-gold-600" aria-hidden />
              {booking.event?.venueName}, {booking.event?.city}
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <LinkButton href={`/akun/pesanan/${booking.id}`}>Lihat detail pesanan</LinkButton>
            <LinkButton href="/akun" variant="outline">
              Ke dashboard
            </LinkButton>
          </div>
        </div>
      </Card>
      <div className="mt-6 text-center">
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          Cetak / simpan bukti
        </Button>
      </div>
    </Container>
  );
}

export default function SuccessPage() {
  return (
    <CustomerShell tabs={false}>
      <Suspense fallback={<Spinner />}>
        <Success />
      </Suspense>
    </CustomerShell>
  );
}
