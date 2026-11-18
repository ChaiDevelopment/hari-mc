'use client';

import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, CalendarDays, ExternalLink, FileText, Mail, MapPin, MessageCircle, MessageSquareWarning, Pencil, Phone } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { AdminPaymentsCard } from '@/components/admin/admin-payments';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { DetailSection, StatusTracker } from '@/components/booking-detail-view';
import { Alert, Button, Card, EmptyState, LinkButton, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { ADMIN_ACTION_LABEL, type AdminBookingDetail } from '@/lib/admin-types';
import { ACTION_LABEL, STATUS_META, formatDate, formatDateTime, formatDuration, formatPhone, formatRupiah, formatTimeRange } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';

const DANGER: BookingStatus[] = ['REJECTED', 'CANCELLED', 'REFUNDED'];
const DESCRIPTION: Partial<Record<BookingStatus, string>> = {
  ACCEPTED: 'Jadwal akan dikunci untuk pesanan ini. Pesanan lain yang bentrok tidak dapat diterima.',
  REJECTED: 'Pelanggan akan menerima notifikasi beserta alasan penolakan.',
  WAITING_PAYMENT: 'Pelanggan akan diminta melakukan pembayaran sesuai rincian biaya.',
  CONFIRMED: 'Pastikan pembayaran (DP) sudah benar-benar diterima.',
  IN_PROGRESS: 'Tandai acara sedang berlangsung.',
  COMPLETED: 'Tandai acara telah selesai.',
  CANCELLED: 'Jadwal akan dibebaskan dan pelanggan menerima notifikasi beserta alasan.',
  REFUNDED: 'Tandai bahwa dana pelanggan telah dikembalikan.',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium break-words whitespace-pre-line text-navy-900">{children}</dd>
    </div>
  );
}

export default function AdminBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<AdminBookingDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [editingPrice, setEditingPrice] = useState(false);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setB(await api<AdminBookingDetail>(`/admin/bookings/${encodeURIComponent(id)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: 'Gagal memuat' });
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return error.status === 404 || error.status === 400 ? (
      <EmptyState title="Booking tidak ditemukan" action={<LinkButton href="/admin/pesanan">Kembali ke daftar</LinkButton>} />
    ) : (
      <Alert tone="error" title="Gagal memuat booking">
        {error.message}
      </Alert>
    );
  if (!b) return <Spinner />;

  const doTransition = (to: BookingStatus, action: string, reasonRequired: boolean) =>
    confirm({
      title: `${ADMIN_ACTION_LABEL[action] ?? STATUS_META[to].label}?`,
      description: (
        <>
          <span className="font-mono">{b.code}</span> · {b.contact.name}
          <br />
          {DESCRIPTION[to]}
        </>
      ),
      confirmLabel: ADMIN_ACTION_LABEL[action] ?? 'Lanjutkan',
      tone: DANGER.includes(to) ? 'danger' : 'default',
      input: reasonRequired
        ? { label: 'Alasan (dikirim ke pelanggan)', minLength: 5, placeholder: 'Contoh: sudah ada acara lain di tanggal tersebut' }
        : { label: 'Catatan (opsional)', required: false },
      onConfirm: async (note) => {
        try {
          const updated = await api<AdminBookingDetail>(`/admin/bookings/${b.id}/transition`, {
            method: 'POST',
            body: { toStatus: to, expectedStatus: b.status, ...(note ? { note } : {}) },
          });
          setB(updated);
          toast('success', `Status diperbarui: ${STATUS_META[to].label}`);
        } catch (e) {
          if (e instanceof ApiError && (e.code === 'STALE_STATUS' || e.code === 'SLOT_CONFLICT')) void load();
          throw new Error(e instanceof ApiError ? e.message : 'Gagal memperbarui status');
        }
      },
    });

  const requestChanges = () =>
    confirm({
      title: 'Minta perubahan ke pelanggan',
      description: 'Status tidak berubah. Pesan ini tercatat di riwayat dan dikirim sebagai notifikasi ke pelanggan.',
      confirmLabel: 'Kirim permintaan',
      input: { label: 'Pesan untuk pelanggan', minLength: 5, placeholder: 'Contoh: mohon konfirmasi jam mulai dan kirim rundown lengkap' },
      onConfirm: async (message) => {
        try {
          setB(await api<AdminBookingDetail>(`/admin/bookings/${b.id}/request-changes`, { method: 'POST', body: { message } }));
          toast('success', 'Permintaan perubahan terkirim ke pelanggan');
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : 'Gagal mengirim');
        }
      },
    });

  const blockingConflicts = b.conflicts.filter((c) => c.blocking);
  const waNumber = b.contact.whatsapp.replace(/\D/g, '');
  const e = b.event;

  return (
    <>
      {dialog}
      <Link href="/admin/pesanan" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua pesanan
      </Link>
      <PageHeader eyebrow={b.service.name} title={e?.eventName ?? b.code} actions={<StatusBadge status={b.status} className="text-sm" />}>
        <span className="font-mono font-semibold text-navy-900" data-testid="booking-code">
          {b.code}
        </span>{' '}
        · masuk {formatDateTime(b.createdAt)}
      </PageHeader>

      {blockingConflicts.length > 0 && !['ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status) && (
        <Alert tone="error" className="mb-6" title="Jadwal bentrok dengan acara yang sudah terkunci">
          {blockingConflicts.map((c) => (
            <span key={c.id} className="mr-3 inline-block">
              <Link href={`/admin/pesanan/${c.id}`} className="font-mono font-semibold underline">
                {c.code}
              </Link>{' '}
              ({c.type === 'OVERLAP' ? 'waktu tumpang tindih' : `dalam jeda perjalanan ${b.schedule.travelBufferMinutes} menit`})
            </span>
          ))}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
            <StatusTracker status={b.status} />
            {(b.allowedTransitions.length > 0 || b.canRequestChanges) && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5" data-testid="admin-actions">
                {b.allowedTransitions.map((t) => (
                  <Button
                    key={t.to}
                    variant={DANGER.includes(t.to) ? 'danger' : t.to === b.allowedTransitions[0].to ? 'gold' : 'navy'}
                    size="sm"
                    onClick={() => doTransition(t.to, t.action, t.reasonRequired)}
                  >
                    {ADMIN_ACTION_LABEL[t.action] ?? t.to}
                  </Button>
                ))}
                {b.canRequestChanges && (
                  <Button variant="outline" size="sm" onClick={requestChanges}>
                    <MessageSquareWarning className="size-4" aria-hidden /> Minta perubahan
                  </Button>
                )}
              </div>
            )}
            {b.status === 'ACCEPTED' && !b.pricing.hasPrice && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Tetapkan rincian biaya sebelum meminta pembayaran.</p>
            )}
          </Card>

          <DetailSection title="Jadwal & Lokasi">
            <Row label="Tanggal">{formatDate(b.schedule.start, b.schedule.timezone)}</Row>
            <Row label="Waktu">
              {formatTimeRange(b.schedule.start, b.schedule.end, b.schedule.timezone)} ({formatDuration(b.schedule.durationMinutes)})
            </Row>
            <Row label="Jeda perjalanan">{b.schedule.travelBufferMinutes} menit sebelum & sesudah</Row>
            <Row label="Tempat">{e?.venueName}</Row>
            <Row label="Alamat">{e ? `${e.address}\n${e.city}` : null}</Row>
            <Row label="Google Maps">
              {e?.mapsUrl ? (
                <a href={e.mapsUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-gold-700 underline underline-offset-2">
                  Buka lokasi <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </Row>
            <Row label="Estimasi tamu">{e?.guestCount ? `${e.guestCount} orang` : null}</Row>
          </DetailSection>

          <DetailSection title="Kebutuhan MC">
            <Row label="Konsep">{e?.concept}</Row>
            <Row label="Bahasa">{e?.language}</Row>
            <Row label="Dress code">{e?.dressCode}</Row>
            <Row label="Rundown">{e?.rundown}</Row>
            <Row label="Deskripsi kegiatan">{e?.activityDescription}</Row>
            <Row label="Permintaan khusus">{e?.specialRequests}</Row>
            <Row label="Catatan tambahan">{e?.additionalNotes}</Row>
            {Object.entries(b.formAnswers).map(([k, v]) => (
              <Row key={k} label={k}>
                {typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak') : String(v)}
              </Row>
            ))}
            {!e?.concept && !e?.language && !e?.dressCode && !e?.rundown && !e?.activityDescription && !e?.specialRequests && !e?.additionalNotes && Object.keys(b.formAnswers).length === 0 && (
              <p className="py-2.5 text-sm text-muted">Tidak ada catatan khusus dari pelanggan.</p>
            )}
          </DetailSection>

          <Card className="p-6">
            <h2 className="font-display text-xl text-navy-900">Lampiran</h2>
            {b.attachments.length ? (
              <ul className="mt-3 space-y-2">
                {b.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <FileText className="size-4 text-gold-600" aria-hidden /> {a.fileName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Tidak ada lampiran.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-xl text-navy-900">Riwayat perubahan</h2>
            <ol className="relative mt-5 space-y-5 border-l border-cream-300 pl-6" data-testid="admin-timeline">
              {[...b.timeline].reverse().map((t, i) => (
                <li key={`${t.createdAt}-${i}`} className="relative">
                  <span className={clsx('absolute top-1 -left-[1.95rem] size-4 rounded-full ring-4 ring-white', i === 0 ? 'bg-gold-500' : 'bg-cream-300')} />
                  <p className="text-sm font-semibold text-navy-900">
                    {ACTION_LABEL[t.action] ?? STATUS_META[t.toStatus].label}
                    {t.fromStatus && t.fromStatus !== t.toStatus && <span className="font-normal text-muted"> · {STATUS_META[t.fromStatus].label} → {STATUS_META[t.toStatus].label}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(t.createdAt)} · {t.actorType === 'CUSTOMER' ? 'Pelanggan' : t.actorType === 'ADMIN' ? (t.actorName ?? 'Admin') : 'Sistem'}
                  </p>
                  {t.note && <p className="mt-1.5 rounded-lg bg-cream-100 px-3 py-2 text-sm text-navy-800">{t.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-xl text-navy-900">Pelanggan</h2>
            <p className="mt-3 font-semibold text-navy-900">{b.contact.name}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-gold-600" aria-hidden /> {formatPhone(b.contact.whatsapp)}
              </li>
              <li className="flex items-center gap-2 break-all">
                <Mail className="size-4 shrink-0 text-gold-600" aria-hidden /> {b.contact.email}
              </li>
              {b.customer.city && (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 text-gold-600" aria-hidden /> {b.customer.city}
                </li>
              )}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
              <LinkButton href={`/admin/pelanggan/${b.customer.id}`} variant="outline" size="sm">
                Profil pelanggan
              </LinkButton>
            </div>
            {b.customer.email !== b.contact.email && <p className="mt-3 text-xs text-muted">Akun: {b.customer.email}</p>}
          </Card>

          <PricingEditor b={b} editing={editingPrice} setEditing={setEditingPrice} onSaved={(nb) => { setB(nb); toast('success', 'Rincian biaya disimpan'); }} />

          <AdminPaymentsCard b={b} onChanged={load} />

          {b.conflicts.length > 0 && (
            <Card className="p-6">
              <h2 className="flex items-center gap-2 font-display text-xl text-navy-900">
                <AlertTriangle className="size-4 text-amber-600" aria-hidden /> Jadwal berdekatan
              </h2>
              <ul className="mt-3 space-y-2" data-testid="conflicts">
                {b.conflicts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/pesanan/${c.id}`} className="block rounded-lg border border-line px-3 py-2 text-sm hover:border-gold-400">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{c.code}</span>
                        {c.status && <StatusBadge status={c.status} />}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-muted">
                        <CalendarDays className="size-3.5" aria-hidden />
                        {c.start && c.end ? formatTimeRange(c.start, c.end) : ''} · {c.type === 'OVERLAP' ? 'tumpang tindih' : 'dalam jeda'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function PricingEditor({ b, editing, setEditing, onSaved }: { b: AdminBookingDetail; editing: boolean; setEditing: (v: boolean) => void; onSaved: (b: AdminBookingDetail) => void }) {
  const p = b.pricing;
  const [form, setForm] = useState({ packagePrice: '', transportFee: '', additionalFee: '', additionalFeeNote: '', discountAmount: '', depositAmount: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      const n = (v: string) => (Number(v) ? String(Math.round(Number(v))) : '');
      setForm({ packagePrice: n(p.packagePrice), transportFee: n(p.transportFee), additionalFee: n(p.additionalFee), additionalFeeNote: p.additionalFeeNote ?? '', discountAmount: n(p.discountAmount), depositAmount: n(p.depositAmount) });
      setErrors({});
    }
  }, [editing, p]);

  const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/\D/g, '')));
  const total = num(form.packagePrice) + num(form.transportFee) + num(form.additionalFee) - num(form.discountAmount);

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const updated = await api<AdminBookingDetail>(`/admin/bookings/${b.id}/pricing`, {
        method: 'PATCH',
        body: {
          packagePrice: num(form.packagePrice),
          transportFee: num(form.transportFee),
          additionalFee: num(form.additionalFee),
          additionalFeeNote: form.additionalFeeNote || undefined,
          discountAmount: num(form.discountAmount),
          depositAmount: num(form.depositAmount),
        },
      });
      setEditing(false);
      onSaved(updated);
    } catch (e) {
      if (e instanceof ApiError && e.errors.length) setErrors(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      else setErrors({ _: e instanceof ApiError ? e.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string) => (
    <label className="block">
      <span className="text-sm font-medium text-navy-900">{label}</span>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">Rp</span>
        <input
          className="field-input pl-10"
          inputMode="numeric"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(/[^\d]/g, '') })}
          aria-invalid={errors[key] ? true : undefined}
          name={key}
        />
      </div>
      {errors[key] && <span className="mt-1 block text-xs text-rose-700">{errors[key]}</span>}
    </label>
  );

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-navy-900">Rincian biaya</h2>
        {b.pricingEditable && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-pricing">
            <Pencil className="size-3.5" aria-hidden /> {p.hasPrice ? 'Ubah' : 'Tetapkan'}
          </Button>
        )}
      </div>
      {!editing ? (
        p.hasPrice ? (
          <dl className="mt-4 space-y-2 text-sm">
            {[
              [p.packageName ?? 'Jasa MC', p.packagePrice],
              ['Transportasi', p.transportFee],
              [p.additionalFeeNote ?? 'Biaya tambahan', p.additionalFee],
            ]
              .filter(([, v]) => Number(v) > 0)
              .map(([l, v]) => (
                <div key={l} className="flex justify-between gap-3">
                  <dt className="text-muted">{l}</dt>
                  <dd>{formatRupiah(v as string)}</dd>
                </div>
              ))}
            {Number(p.discountAmount) > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Diskon</dt>
                <dd>−{formatRupiah(p.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
              <dt>Total</dt>
              <dd data-testid="price-total">{formatRupiah(p.totalAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">DP</dt>
              <dd>{Number(p.depositAmount) > 0 ? formatRupiah(p.depositAmount) : 'Belum ditetapkan'}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">Belum ditetapkan. Pelanggan melihat “menunggu konfirmasi harga”.</p>
        )
      ) : (
        <form onSubmit={save} className="mt-4 space-y-3" data-testid="pricing-form">
          {field('packagePrice', p.packageName ? `Jasa MC (${p.packageName})` : 'Jasa MC')}
          {field('transportFee', 'Transportasi')}
          {field('additionalFee', 'Biaya tambahan')}
          {num(form.additionalFee) > 0 && (
            <label className="block">
              <span className="text-sm font-medium text-navy-900">Keterangan biaya tambahan</span>
              <input className="field-input mt-1" value={form.additionalFeeNote} maxLength={200} onChange={(e) => setForm({ ...form, additionalFeeNote: e.target.value })} name="additionalFeeNote" />
              {errors.additionalFeeNote && <span className="mt-1 block text-xs text-rose-700">{errors.additionalFeeNote}</span>}
            </label>
          )}
          {field('discountAmount', 'Diskon')}
          <p className="flex justify-between rounded-lg bg-cream-100 px-3 py-2 text-sm font-semibold">
            <span>Total</span>
            <span className={total < 0 ? 'text-rose-700' : ''}>{formatRupiah(total)}</span>
          </p>
          {field('depositAmount', 'DP (uang muka)')}
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
              Batal
            </Button>
            <Button type="submit" variant="navy" className="flex-1" loading={saving}>
              Simpan
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
