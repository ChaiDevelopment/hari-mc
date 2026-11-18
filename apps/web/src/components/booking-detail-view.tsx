import clsx from 'clsx';
import { Check, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { ACTION_LABEL, ACTOR_LABEL, MAIN_FLOW, STATUS_META, formatDate, formatDateTime, formatDuration, formatPhone, formatRupiah, formatTimeRange } from '@/lib/format';
import type { BookingDetail, BookingStatus } from '@/lib/types';
import { Card } from './ui';

/** Progress tracker: alur utama + penanda untuk status akhir di luar alur (dibatalkan/ditolak). */
export function StatusTracker({ status }: { status: BookingStatus }) {
  const offFlow = !MAIN_FLOW.includes(status);
  const currentIndex = MAIN_FLOW.indexOf(status);
  return (
    <div>
      <ol className="grid grid-cols-6 gap-1.5" aria-label="Tahapan pesanan">
        {MAIN_FLOW.map((s, i) => {
          const done = !offFlow && i < currentIndex;
          const current = !offFlow && i === currentIndex;
          const completedFinal = status === 'COMPLETED' && i === currentIndex;
          return (
            <li key={s} aria-current={current ? 'step' : undefined}>
              <div className={clsx('h-1.5 rounded-full', done || completedFinal ? 'bg-gold-500' : current ? 'bg-gold-300' : 'bg-cream-200')} />
              <p className={clsx('mt-2 hidden text-[0.7rem] leading-tight sm:block', current || done ? 'font-semibold text-navy-900' : 'text-muted')}>
                {STATUS_META[s].label}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-navy-800">{STATUS_META[status].description}</p>
    </div>
  );
}

export function Timeline({ entries }: { entries: BookingDetail['timeline'] }) {
  return (
    <ol className="relative space-y-6 border-l border-cream-300 pl-6" data-testid="timeline">
      {[...entries].reverse().map((t, i) => (
        <li key={`${t.createdAt}-${i}`} className="relative">
          <span className={clsx('absolute top-1 -left-[1.95rem] grid size-4 place-items-center rounded-full ring-4 ring-white', i === 0 ? 'bg-gold-500' : 'bg-cream-300')}>
            {i === 0 && <Check className="size-2.5 text-navy-950" aria-hidden />}
          </span>
          <p className="text-sm font-semibold text-navy-900">{ACTION_LABEL[t.action] ?? STATUS_META[t.toStatus].label}</p>
          <p className="text-xs text-muted">
            {formatDateTime(t.createdAt)} · oleh {ACTOR_LABEL[t.actorType]}
          </p>
          {t.note && <p className="mt-1.5 rounded-lg bg-cream-100 px-3 py-2 text-sm text-navy-800">{t.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium break-words whitespace-pre-line text-navy-900">{children}</dd>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl text-navy-900">{title}</h2>
      <dl className="mt-3 divide-y divide-line/70">{children}</dl>
    </Card>
  );
}

/** Ringkasan isi pesanan — dipakai di halaman detail. */
export function BookingSections({ b }: { b: BookingDetail }) {
  const e = b.event;
  const answers = Object.entries(b.formAnswers ?? {});
  return (
    <>
      <DetailSection title="Detail Acara">
        <Row label="Nama acara">{e?.eventName}</Row>
        <Row label="Kategori">{b.service.name}</Row>
        <Row label="Tanggal">{formatDate(b.schedule.start, b.schedule.timezone)}</Row>
        <Row label="Waktu">
          {formatTimeRange(b.schedule.start, b.schedule.end, b.schedule.timezone)} ({formatDuration(b.schedule.durationMinutes)})
        </Row>
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
        {answers.map(([k, v]) => (
          <Row key={k} label={k}>
            {typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak') : String(v)}
          </Row>
        ))}
        {!e?.concept && !e?.language && !e?.dressCode && !e?.rundown && !e?.activityDescription && !e?.specialRequests && !e?.additionalNotes && answers.length === 0 && (
          <p className="py-2.5 text-sm text-muted">Tidak ada catatan khusus.</p>
        )}
      </DetailSection>

      <DetailSection title="Data Pemesan">
        <Row label="Nama">{b.contact.name}</Row>
        <Row label="Email">{b.contact.email}</Row>
        <Row label="WhatsApp">{formatPhone(b.contact.whatsapp)}</Row>
      </DetailSection>
    </>
  );
}

export function PricingCard({ pricing }: { pricing: BookingDetail['pricing'] }) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl text-navy-900">Rincian Biaya</h2>
      {pricing.hasPrice ? (
        <dl className="mt-4 space-y-2 text-sm">
          {pricing.packageName && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{pricing.packageName}</dt>
              <dd className="font-medium">{formatRupiah(pricing.packagePrice)}</dd>
            </div>
          )}
          {Number(pricing.transportFee) > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Transportasi</dt>
              <dd className="font-medium">{formatRupiah(pricing.transportFee)}</dd>
            </div>
          )}
          {Number(pricing.additionalFee) > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{pricing.additionalFeeNote ?? 'Biaya tambahan'}</dt>
              <dd className="font-medium">{formatRupiah(pricing.additionalFee)}</dd>
            </div>
          )}
          {Number(pricing.discountAmount) > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Diskon</dt>
              <dd className="font-medium">−{formatRupiah(pricing.discountAmount)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t border-line pt-3 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="font-semibold text-navy-900">{formatRupiah(pricing.totalAmount)}</dd>
          </div>
          {Number(pricing.depositAmount) > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">DP</dt>
              <dd className="font-medium">{formatRupiah(pricing.depositAmount)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted" data-testid="price-pending">
          Rincian biaya belum ditetapkan dan akan dikonfirmasi oleh Hari Susanto setelah meninjau pesanan Anda.
        </p>
      )}
    </Card>
  );
}
