'use client';

import { Check, FileText, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ApiError, openPrivateFile } from '@/lib/api';
import type { AdminBookingDetail } from '@/lib/admin-types';
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, formatRupiah, formatShortDate } from '@/lib/format';
import { PaymentStatusPill } from '../payment-panel';
import { Alert, Button, Card } from '../ui';
import { useConfirm, useToast } from './feedback';

const PAYABLE = ['WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const METHODS = ['BANK_TRANSFER', 'CASH', 'E_WALLET', 'QRIS', 'OTHER'] as const;

/** Kartu pembayaran di detail booking CMS: verifikasi/tolak bukti, lihat bukti, catat pembayaran manual. */
export function AdminPaymentsCard({ b, onChanged }: { b: AdminBookingDetail; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const s = b.paymentSummary;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', method: 'CASH', paidAt: today, notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const canRecord = PAYABLE.includes(b.status) && s.totalAmount > 0 && s.outstanding > 0;

  const verify = (id: string, amount: string) =>
    confirm({
      title: 'Verifikasi pembayaran?',
      description: (
        <>
          Pastikan dana <strong>{formatRupiah(amount)}</strong> sudah benar-benar masuk ke rekening.
          {b.status === 'WAITING_PAYMENT' && s.verifiedPaid + Number(amount) >= s.confirmThreshold && <> Pesanan akan otomatis <strong>terkonfirmasi</strong> dan jadwal dikunci.</>}
        </>
      ),
      confirmLabel: 'Ya, dana sudah masuk',
      onConfirm: async () => {
        try {
          await api(`/admin/payments/${id}/verify`, { method: 'POST' });
          toast('success', 'Pembayaran diverifikasi');
          await onChanged();
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : 'Gagal memverifikasi');
        }
      },
    });

  const reject = (id: string) =>
    confirm({
      title: 'Tolak bukti pembayaran?',
      description: 'Pelanggan akan menerima alasan penolakan dan dapat mengirim bukti baru.',
      confirmLabel: 'Tolak bukti',
      tone: 'danger',
      input: { label: 'Alasan (dikirim ke pelanggan)', minLength: 5, placeholder: 'Contoh: nominal di bukti tidak terbaca' },
      onConfirm: async (reason) => {
        try {
          await api(`/admin/payments/${id}/reject`, { method: 'POST', body: { reason } });
          toast('success', 'Bukti pembayaran ditolak');
          await onChanged();
        } catch (e) {
          throw new Error(e instanceof ApiError ? e.message : 'Gagal menolak');
        }
      },
    });

  const record = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api(`/admin/bookings/${b.id}/payments`, {
        method: 'POST',
        body: { amount: Number(form.amount || 0), method: form.method, paidAt: new Date(`${form.paidAt}T12:00:00+07:00`).toISOString(), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) },
      });
      toast('success', 'Pembayaran dicatat');
      setOpen(false);
      setForm({ amount: '', method: 'CASH', paidAt: today, notes: '' });
      await onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      else setErrors({ _: err instanceof ApiError ? err.message : 'Gagal mencatat' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6" data-testid="admin-payments">
      {dialog}
      <h2 className="font-display text-xl text-navy-900">Pembayaran</h2>
      {s.totalAmount > 0 ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          {[
            ['Total', s.totalAmount],
            [s.depositAmount > 0 ? 'DP (syarat konfirmasi)' : 'Syarat konfirmasi (lunas)', s.confirmThreshold],
            ['Terverifikasi', s.verifiedPaid],
            ...(s.pendingAmount > 0 ? [['Menunggu verifikasi', s.pendingAmount] as const] : []),
            ['Sisa tagihan', s.outstanding],
          ].map(([l, v]) => (
            <div key={l as string} className="flex justify-between gap-3">
              <dt className="text-muted">{l}</dt>
              <dd className="font-medium">{formatRupiah(v as number)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">Tetapkan rincian biaya terlebih dahulu.</p>
      )}

      {b.status === 'WAITING_PAYMENT' && s.verifiedPaid < s.confirmThreshold && !s.hasPendingPayment && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Menunggu bukti transfer dari pelanggan. Pembayaran tunai dapat dicatat langsung di bawah.</p>
      )}

      {b.payments.length > 0 && (
        <ul className="mt-4 space-y-2" data-testid="admin-payment-list">
          {b.payments.map((p) => (
            <li key={p.id} className={`rounded-xl border p-3 text-sm ${p.status === 'PENDING' ? 'border-gold-400 bg-gold-200/20' : 'border-line'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-navy-900">
                  {PAYMENT_TYPE_LABEL[p.type]} · {formatRupiah(p.amount)}
                </span>
                <PaymentStatusPill status={p.status} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {p.code} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method} · {formatShortDate(p.paidAt)}
              </p>
              {p.notes && <p className="mt-1 text-xs whitespace-pre-line text-navy-800">{p.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {p.proof && (
                  <Button variant="outline" size="sm" onClick={() => openPrivateFile(`/admin/payments/${p.id}/proof`).catch(() => toast('error', 'Gagal membuka bukti'))}>
                    <FileText className="size-3.5" aria-hidden /> Lihat bukti
                  </Button>
                )}
                {p.status === 'PENDING' && (
                  <>
                    <Button variant="navy" size="sm" onClick={() => verify(p.id, p.amount)} data-testid="verify-payment">
                      <Check className="size-3.5" aria-hidden /> Verifikasi
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => reject(p.id)}>
                      <X className="size-3.5" aria-hidden /> Tolak
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canRecord && !open && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Catat pembayaran diterima
        </Button>
      )}
      {open && (
        <form onSubmit={record} className="mt-4 space-y-3 rounded-xl border border-line p-4" data-testid="record-payment-form">
          <p className="text-sm font-semibold text-navy-900">Catat pembayaran (langsung terverifikasi)</p>
          <label className="block">
            <span className="text-sm text-navy-900">Nominal (maks. {formatRupiah(s.outstanding)})</span>
            <input className="field-input mt-1" inputMode="numeric" name="amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} required />
            {errors.amount && <span className="mt-1 block text-xs text-rose-700">{errors.amount}</span>}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-navy-900">Metode</span>
              <select className="field-input mt-1" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-navy-900">Tanggal</span>
              <input className="field-input mt-1" type="date" max={today} value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
            </label>
          </div>
          <input className="field-input" placeholder="Catatan (opsional)" maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
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
