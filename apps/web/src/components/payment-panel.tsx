'use client';

import clsx from 'clsx';
import { CheckCircle2, Clock, FileText, MessageCircle, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, apiUpload, openPrivateFile } from '@/lib/api';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_META, PAYMENT_TYPE_LABEL, formatDateTime, formatRupiah, formatShortDate } from '@/lib/format';
import type { BookingDetail, PaymentRecord } from '@/lib/types';
import { Alert, Button, Card } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;
const METHODS = ['BANK_TRANSFER', 'E_WALLET', 'QRIS', 'OTHER'] as const;

export function PaymentStatusPill({ status }: { status: string }) {
  const m = PAYMENT_STATUS_META[status] ?? PAYMENT_STATUS_META.PENDING;
  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', m.className)}>{m.label}</span>;
}

export function PaymentHistory({ payments, proofPath }: { payments: PaymentRecord[]; proofPath: (p: PaymentRecord) => string }) {
  const [error, setError] = useState<string | null>(null);
  if (!payments.length) return null;
  return (
    <div>
      <ul className="space-y-2" data-testid="payment-history">
        {payments.map((p) => (
          <li key={p.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-navy-900">
                {PAYMENT_TYPE_LABEL[p.type]} · {formatRupiah(p.amount)}
              </span>
              <PaymentStatusPill status={p.status} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {p.code} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method} · dibayar {formatShortDate(p.paidAt)}
            </p>
            {p.notes && <p className={clsx('mt-1.5 text-xs whitespace-pre-line', p.status === 'REJECTED' ? 'text-rose-700' : 'text-navy-800')}>{p.notes}</p>}
            {p.proof && (
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-700 hover:text-navy-900"
                onClick={() => openPrivateFile(proofPath(p)).catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal membuka bukti'))}
              >
                <FileText className="size-3.5" aria-hidden /> Lihat bukti
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

/** Panel pembayaran untuk pelanggan: jumlah yang harus dibayar, cara bayar, unggah bukti, riwayat. */
export function CustomerPaymentPanel({ booking, onChanged }: { booking: BookingDetail; onChanged: () => void }) {
  const s = booking.paymentSummary;
  const payments = booking.payments ?? [];
  const info = booking.paymentInstructions;
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [form, setForm] = useState({ amount: s ? String(s.dueNow) : '', method: 'BANK_TRANSFER', paidAt: today, notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!s || s.totalAmount <= 0 || (s.dueNow <= 0 && payments.length === 0)) return null;

  const dueLabel =
    booking.status === 'WAITING_PAYMENT' ? (s.depositAmount > 0 ? 'DP yang perlu dibayar' : 'Total yang perlu dibayar') : 'Sisa pelunasan';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!file) errs.file = 'Pilih foto atau PDF bukti transfer';
    else if (file.size > MAX_BYTES) errs.file = 'Ukuran file maksimal 5 MB';
    const amount = Number(form.amount.replace(/\D/g, ''));
    if (!amount) errs.amount = 'Isi nominal yang ditransfer';
    else if (amount > s.outstanding) errs.amount = `Maksimal ${formatRupiah(s.outstanding)}`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSending(true);
    try {
      await apiUpload(`/bookings/${booking.id}/payments`, file!, {
        amount: String(amount),
        method: form.method,
        paidAt: new Date(`${form.paidAt}T12:00:00+07:00`).toISOString(),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      setSent(true);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      else setErrors({ _: err instanceof ApiError ? err.message : 'Gagal mengirim bukti' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className={clsx('p-6', s.dueNow > 0 && 'border-gold-400 ring-4 ring-gold-200/50')} data-testid="payment-panel">
      <h2 className="font-display text-xl text-navy-900">Pembayaran</h2>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Total biaya</dt>
          <dd className="font-medium">{formatRupiah(s.totalAmount)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Sudah diterima</dt>
          <dd className="font-medium">{formatRupiah(s.verifiedPaid)}</dd>
        </div>
        {s.pendingAmount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Menunggu verifikasi</dt>
            <dd className="font-medium">{formatRupiah(s.pendingAmount)}</dd>
          </div>
        )}
      </dl>

      {s.dueNow > 0 && (
        <div className="mt-4 rounded-xl bg-navy-900 px-4 py-3 text-cream-50">
          <p className="text-xs text-cream-200/75">{dueLabel}</p>
          <p className="font-display text-2xl" data-testid="amount-due">
            {formatRupiah(s.dueNow)}
          </p>
        </div>
      )}
      {s.dueNow <= 0 && s.outstanding <= 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden /> Lunas
        </p>
      )}

      {s.dueNow > 0 && info && (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-semibold text-navy-900">Transfer ke</p>
          {info.bankAccounts.length ? (
            info.bankAccounts.map((a) => (
              <div key={a.accountNumber} className="rounded-lg bg-cream-100 px-3 py-2">
                <p className="font-semibold text-navy-900">{a.bankName}</p>
                <p className="font-mono text-navy-900">{a.accountNumber}</p>
                <p className="text-muted">a.n. {a.accountHolder}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-cream-100 px-3 py-2 text-navy-800">Rekening pembayaran akan diinformasikan langsung oleh Hari Susanto.</p>
          )}
          {info.instructions && <p className="whitespace-pre-line text-navy-800">{info.instructions}</p>}
          {info.contactWhatsapp && (
            <a href={`https://wa.me/${info.contactWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <MessageCircle className="size-4" aria-hidden /> Tanya Hari Susanto via WhatsApp
            </a>
          )}
        </div>
      )}

      {s.hasPendingPayment && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="payment-pending">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> Bukti pembayaran sedang diverifikasi Hari Susanto. Status pesanan akan diperbarui setelah dana diterima.
        </p>
      )}
      {sent && !s.hasPendingPayment && <Alert tone="success" className="mt-4">Bukti terkirim.</Alert>}

      {s.canSubmitPayment && (
        <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-5" data-testid="payment-form">
          <p className="font-semibold text-navy-900">Sudah transfer? Kirim bukti pembayaran</p>
          <label className="block">
            <span className="text-sm font-medium text-navy-900">Bukti transfer (foto/PDF, maks. 5 MB)</span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-navy-800 file:mr-3 file:rounded-full file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream-50 hover:file:bg-navy-800"
            />
            {errors.file && <span className="mt-1 block text-xs text-rose-700">{errors.file}</span>}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-navy-900">Nominal ditransfer</span>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">Rp</span>
                <input className="field-input pl-10" inputMode="numeric" name="amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} />
              </div>
              {errors.amount && <span className="mt-1 block text-xs text-rose-700">{errors.amount}</span>}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-navy-900">Tanggal transfer</span>
              <input className="field-input mt-1" type="date" name="paidAt" max={today} value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
              {errors.paidAt && <span className="mt-1 block text-xs text-rose-700">{errors.paidAt}</span>}
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-navy-900">Metode</span>
            <select className="field-input mt-1" name="method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-navy-900">Catatan (opsional)</span>
            <input className="field-input mt-1" name="notes" maxLength={500} placeholder="Contoh: transfer dari rekening a.n. Budi" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <Button type="submit" className="w-full" loading={sending} data-testid="submit-payment">
            <Upload className="size-4" aria-hidden /> Kirim bukti pembayaran
          </Button>
        </form>
      )}

      {payments.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="mb-2 text-sm font-semibold text-navy-900">Riwayat pembayaran</p>
          <PaymentHistory payments={payments} proofPath={(p) => `/bookings/${booking.id}/payments/${p.id}/proof`} />
          <p className="mt-2 text-xs text-muted">Diperbarui {formatDateTime(booking.updatedAt)}</p>
        </div>
      )}
    </Card>
  );
}
