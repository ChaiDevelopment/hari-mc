'use client';

import { ArrowLeft, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BookingSections, PricingCard, StatusTracker, Timeline } from '@/components/booking-detail-view';
import { CustomerPaymentPanel } from '@/components/payment-panel';
import { ReviewInvite } from '@/components/review-invite';
import { Alert, Button, Card, Container, EmptyState, LinkButton, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { BookingDetail } from '@/lib/types';

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setBooking(await api<BookingDetail>(`/bookings/${encodeURIComponent(id)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: 'Gagal memuat pesanan' });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (e: FormEvent) => {
    e.preventDefault();
    setCancelError(null);
    setCancelling(true);
    try {
      setBooking(await api<BookingDetail>(`/bookings/${booking!.id}/cancel`, { method: 'POST', body: { reason } }));
      setCancelOpen(false);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Gagal membatalkan pesanan');
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <Container className="pt-12">
        {error.status === 404 || error.status === 400 ? (
          <EmptyState title="Pesanan tidak ditemukan" action={<LinkButton href="/akun/pesanan">Kembali ke daftar pesanan</LinkButton>}>
            Pesanan ini tidak ada atau bukan milik akun Anda.
          </EmptyState>
        ) : (
          <Alert tone="error" title="Gagal memuat pesanan">
            {error.message}
          </Alert>
        )}
      </Container>
    );
  }
  if (!booking) return <Spinner />;

  return (
    <Container className="pt-8">
      <Link href="/akun/pesanan" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua pesanan
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm text-muted">Nomor booking</p>
          <h1 className="font-mono text-2xl font-semibold tracking-wide text-navy-900 sm:text-3xl" data-testid="booking-code">
            {booking.code}
          </h1>
          <p className="mt-1 text-sm text-muted">Dikirim {formatDateTime(booking.createdAt)}</p>
        </div>
        <StatusBadge status={booking.status} className="self-start text-sm" />
      </div>

      <Card className="mt-6 p-6">
        <StatusTracker status={booking.status} />
        {booking.rejectionReason && (
          <Alert tone="error" className="mt-4" title="Alasan">
            {booking.rejectionReason}
          </Alert>
        )}
        {booking.cancellationReason && (
          <p className="mt-4 rounded-lg bg-cream-100 px-3 py-2 text-sm text-navy-800">Alasan pembatalan: {booking.cancellationReason}</p>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-6">
          {booking.reviewInvite && <ReviewInvite invite={booking.reviewInvite} />}
          <CustomerPaymentPanel booking={booking} onChanged={() => void load()} />
          <BookingSections b={booking} />
        </div>
        <aside className="space-y-6">
          <PricingCard pricing={booking.pricing} />
          <Card className="p-6">
            <h2 className="font-display text-xl text-navy-900">Riwayat Status</h2>
            <div className="mt-5">
              <Timeline entries={booking.timeline} />
            </div>
          </Card>
          {booking.allowedActions.includes('CANCEL') && (
            <Card className="p-6">
              {!cancelOpen ? (
                <Button variant="danger" className="w-full" onClick={() => setCancelOpen(true)}>
                  <XCircle className="size-4" aria-hidden /> Batalkan pesanan
                </Button>
              ) : (
                <form onSubmit={cancel} className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-navy-900">Alasan pembatalan</span>
                    <textarea
                      className="field-input mt-1.5 min-h-24"
                      required
                      minLength={5}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Contoh: acara diundur"
                    />
                  </label>
                  {cancelError && <Alert tone="error">{cancelError}</Alert>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setCancelOpen(false)}>
                      Kembali
                    </Button>
                    <Button type="submit" variant="danger" className="flex-1" loading={cancelling}>
                      Ya, batalkan
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          )}
        </aside>
      </div>
    </Container>
  );
}
