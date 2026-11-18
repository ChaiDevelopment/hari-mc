'use client';

import { Bell, CalendarCheck, CalendarDays, CheckCheck, ClipboardList, MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BookingCard } from '@/components/booking-card';
import { Avatar } from '@/components/site-header';
import { Alert, Button, Card, Container, EmptyState, LinkButton, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { firstName, formatDate, formatDateTime, formatPhone, formatTimeRange } from '@/lib/format';
import type { BookingListItem, BookingSummary, CustomerProfile, NotificationItem, Paginated } from '@/lib/types';

interface DashboardData {
  summary: BookingSummary;
  recent: Paginated<BookingListItem>;
  notifications: { items: NotificationItem[]; unread: number };
  profile: CustomerProfile;
}

export default function DashboardPage() {
  const { state } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [summary, recent, notifications, profile] = await Promise.all([
        api<BookingSummary>('/bookings/summary'),
        api<Paginated<BookingListItem>>('/bookings?pageSize=3'),
        api<{ items: NotificationItem[]; unread: number }>('/notifications?pageSize=5'),
        api<CustomerProfile>('/me/profile'),
      ]);
      setData({ summary, recent, notifications, profile });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Gagal memuat data');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    await load();
  };

  const name = state.status === 'authenticated' ? state.user.name : '';

  return (
    <Container className="pt-10">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 font-display text-3xl text-navy-900 sm:text-4xl" data-testid="greeting">
            Halo, {firstName(name)}!
          </h1>
          <p className="mt-2 text-muted">Pantau pesanan dan jadwal acara Anda di sini.</p>
        </div>
        <LinkButton href="/pesan">
          <Plus className="size-4" aria-hidden /> Pesan MC
        </LinkButton>
      </div>

      {error && (
        <Alert tone="error" className="mt-8" title="Gagal memuat dashboard">
          {error}{' '}
          <button className="font-semibold underline" onClick={() => void load()}>
            Coba lagi
          </button>
        </Alert>
      )}
      {!data && !error && <Spinner />}

      {data && (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total pesanan', value: data.summary.total },
                { label: 'Aktif', value: data.summary.active },
                { label: 'Selesai', value: data.summary.completed },
              ].map((s) => (
                <Card key={s.label} className="p-4 sm:p-5">
                  <dt className="text-xs text-muted sm:text-sm">{s.label}</dt>
                  <dd className="mt-1 font-display text-3xl text-navy-900">{s.value}</dd>
                </Card>
              ))}
            </dl>

            <section aria-labelledby="next-event">
              <h2 id="next-event" className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
                <CalendarCheck className="size-4 text-gold-600" aria-hidden /> Acara berikutnya
              </h2>
              {data.summary.nextEvent ? (
                <Link href={`/akun/pesanan/${data.summary.nextEvent.id}`} className="block overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 shadow-lift transition hover:bg-navy-800 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={data.summary.nextEvent.status} />
                    <span className="font-mono text-xs text-cream-200/60">{data.summary.nextEvent.code}</span>
                  </div>
                  <p className="mt-4 font-display text-2xl">{data.summary.nextEvent.eventName}</p>
                  <div className="mt-4 space-y-1.5 text-sm text-cream-200/85">
                    <p className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-gold-400" aria-hidden />
                      {formatDate(data.summary.nextEvent.eventStartAt, data.summary.nextEvent.timezone)} ·{' '}
                      {formatTimeRange(data.summary.nextEvent.eventStartAt, data.summary.nextEvent.eventEndAt, data.summary.nextEvent.timezone)}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 text-gold-400" aria-hidden />
                      {data.summary.nextEvent.venueName}, {data.summary.nextEvent.city}
                    </p>
                  </div>
                </Link>
              ) : (
                <EmptyState icon={<CalendarDays className="size-5" />} title="Belum ada acara mendatang" action={<LinkButton href="/pesan">Pesan sekarang</LinkButton>}>
                  Pesanan yang sedang berjalan akan tampil di sini.
                </EmptyState>
              )}
            </section>

            <section aria-labelledby="recent">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="recent" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
                  <ClipboardList className="size-4 text-gold-600" aria-hidden /> Pesanan terbaru
                </h2>
                {data.recent.total > 0 && (
                  <Link href="/akun/pesanan" className="text-sm font-semibold text-gold-700 hover:text-navy-900">
                    Lihat semua
                  </Link>
                )}
              </div>
              {data.recent.items.length ? (
                <div className="space-y-3">
                  {data.recent.items.map((b) => (
                    <BookingCard key={b.id} booking={b} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<ClipboardList className="size-5" />} title="Belum ada pesanan">
                  Pesanan pertama Anda akan muncul di sini setelah dikirim.
                </EmptyState>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <Avatar name={data.profile.name} url={data.profile.avatarUrl} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-900">{data.profile.name}</p>
                  <p className="truncate text-sm text-muted">{data.profile.email}</p>
                </div>
              </div>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">WhatsApp</dt>
                  <dd className="font-medium text-navy-900">{formatPhone(data.profile.whatsapp)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Kota</dt>
                  <dd className="font-medium text-navy-900">{data.profile.city ?? '-'}</dd>
                </div>
              </dl>
              <LinkButton href="/akun/profil" variant="outline" size="sm" className="mt-5 w-full">
                Ubah profil
              </LinkButton>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-navy-900">
                  <Bell className="size-4 text-gold-600" aria-hidden /> Notifikasi
                  {data.notifications.unread > 0 && (
                    <span className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-navy-950" data-testid="unread-count">
                      {data.notifications.unread}
                    </span>
                  )}
                </h2>
                {data.notifications.unread > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllRead}>
                    <CheckCheck className="size-4" aria-hidden /> Tandai dibaca
                  </Button>
                )}
              </div>
              {data.notifications.items.length ? (
                <ul className="mt-4 space-y-3">
                  {data.notifications.items.map((n) => (
                    <li key={n.id} className="rounded-xl border border-line p-3">
                      <Link href={n.data.bookingId ? `/akun/pesanan/${n.data.bookingId}` : '/akun'} className="block">
                        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                          {!n.readAt && <span className="size-2 rounded-full bg-gold-500" aria-label="Belum dibaca" />}
                          {n.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{n.body}</p>
                        <p className="mt-1.5 text-xs text-muted/80">{formatDateTime(n.createdAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted">Belum ada notifikasi.</p>
              )}
            </Card>
          </aside>
        </div>
      )}
    </Container>
  );
}
