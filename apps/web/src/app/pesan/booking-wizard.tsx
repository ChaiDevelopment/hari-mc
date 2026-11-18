'use client';

import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Pencil, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CoreField, ExtraField, type FieldCtx } from '@/components/booking-fields';
import { Alert, Button, Card, Container, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  buildPayload,
  draftKeyForServerField,
  extraKey,
  initialDraft,
  sectionTitle,
  STEP_IDS,
  stepOfField,
  validateStep,
  visibleFields,
  type Draft,
  type DraftValue,
  type FieldErrors,
  type StepId,
} from '@/lib/booking-form';
import { formatDuration, formatRupiah, tzLabel } from '@/lib/format';
import type { BookingDetail, BookingFormData, CustomerProfile } from '@/lib/types';

const DRAFT_KEY = 'hmc-booking-draft-v1';
const IDEM_KEY = 'hmc-booking-idempotency-v1';

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage tidak tersedia: form tetap berfungsi tanpa draft */
  }
}

/** Tanggal WIB hari ini + n hari (YYYY-MM-DD) untuk batas input tanggal. */
function wibDate(daysAhead: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

export function BookingWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<BookingFormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [step, setStep] = useState<StepId>('customer');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idemRef = useRef<string>('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Muat konfigurasi form + profil untuk autofill
  useEffect(() => {
    Promise.all([api<BookingFormData>('/booking-form', { auth: false }), api<CustomerProfile>('/me/profile')])
      .then(([form, profile]) => {
        setData(form);
        let d: Draft | null = null;
        const saved = storageGet(DRAFT_KEY);
        if (saved) {
          try {
            d = JSON.parse(saved) as Draft;
          } catch {
            d = null;
          }
        }
        d ??= initialDraft(form.form, { name: profile.name, email: profile.email, whatsapp: profile.whatsapp, city: profile.city });
        const slug = params.get('layanan');
        const preselect = slug && form.services.find((s) => s.slug === slug);
        if (preselect && !d.serviceId) d = { ...d, serviceId: preselect.id };
        setDraft(d);
        idemRef.current = storageGet(IDEM_KEY) ?? crypto.randomUUID();
        storageSet(IDEM_KEY, idemRef.current);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Gagal memuat formulir'));
  }, [params]);

  useEffect(() => {
    if (data) storageSet(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, data]);

  const packages = useMemo(() => {
    if (!data) return [];
    const svc = data.services.find((s) => s.id === draft.serviceId);
    return [...(svc?.packages ?? []), ...data.globalPackages];
  }, [data, draft.serviceId]);

  // Langkah "Paket" hanya ditampilkan jika memang ada paket aktif.
  const steps = useMemo(() => STEP_IDS.filter((s) => s !== 'package' || packages.length > 0), [packages.length]);
  const stepIndex = steps.indexOf(step);

  const set = useCallback((key: string, value: DraftValue) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  }, []);

  // Jika paket terpilih tidak berlaku untuk kategori baru, kosongkan.
  useEffect(() => {
    if (draft.packageId && !packages.some((p) => p.id === draft.packageId)) set('packageId', '');
  }, [packages, draft.packageId, set]);

  const goTo = (s: StepId) => {
    setStep(s);
    setSubmitError(null);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => document.getElementById(`f-${first.replace('.', '-')}`)?.focus());
  };

  const next = () => {
    if (!data) return;
    const errs = validateStep(data.form, step, draft, data.rules);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstError(errs);
    goTo(steps[stepIndex + 1]);
  };

  const submit = async () => {
    if (!data || submitting) return;
    // Validasi ulang semua langkah (draft bisa berasal dari sesi sebelumnya)
    for (const s of steps) {
      const errs = validateStep(data.form, s, draft, data.rules);
      if (Object.keys(errs).length) {
        setErrors(errs);
        if (s !== step) goTo(s);
        return focusFirstError(errs);
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const booking = await api<BookingDetail>('/bookings', {
        method: 'POST',
        body: buildPayload(data.form, draft),
        headers: { 'Idempotency-Key': idemRef.current },
      });
      storageSet(DRAFT_KEY, null);
      storageSet(IDEM_KEY, null);
      router.replace(`/pesan/berhasil?id=${booking.id}`);
    } catch (e) {
      setSubmitting(false);
      if (!(e instanceof ApiError)) return setSubmitError('Koneksi terputus. Periksa internet Anda lalu kirim ulang — pesanan tidak akan tercatat ganda.');
      if (e.status === 401) return router.replace('/masuk?next=/pesan');
      if (e.errors.length) {
        const mapped: FieldErrors = {};
        for (const er of e.errors) mapped[draftKeyForServerField(er.field)] = er.message;
        setErrors(mapped);
        const target = stepOfField(data.form, e.errors[0].field);
        setSubmitError(e.message);
        if (target !== step) goTo(target);
        return focusFirstError(mapped);
      }
      setSubmitError(e.message);
    }
  };

  if (loadError) {
    return (
      <Container className="py-16">
        <Alert tone="error" title="Formulir tidak dapat dimuat">
          {loadError}
        </Alert>
      </Container>
    );
  }
  if (!data) return <Spinner label="Menyiapkan formulir…" />;

  const ctx: FieldCtx = {
    draft,
    errors,
    set,
    services: data.services,
    packages,
    timezones: data.timezones,
    minDate: wibDate(1),
    maxDate: wibDate(data.rules.maxAdvanceDays),
  };

  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <p className="eyebrow">Formulir Pemesanan</p>
      <h1 className="mt-2 font-display text-3xl text-navy-900 sm:text-4xl">Pesan MC untuk acara Anda</h1>

      {/* Progress */}
      <div className="mt-8" aria-label="Kemajuan pengisian">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-navy-900">
            Langkah {stepIndex + 1} dari {steps.length}
          </span>
          <span className="text-muted">{sectionTitle(data.form, step)}</span>
        </div>
        <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <div key={s} className={clsx('h-1.5 rounded-full transition-colors', i <= stepIndex ? 'bg-gold-500' : 'bg-cream-200')} />
          ))}
        </div>
      </div>

      <Card className="mt-6 p-5 sm:p-8">
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-2xl text-navy-900 outline-none">
          {sectionTitle(data.form, step)}
        </h2>

        {step !== 'review' ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {visibleFields(data.form, step).map((f) => (
              <CoreField key={f.key} field={f} ctx={ctx} />
            ))}
            {step === 'mc' &&
              data.form.extraQuestions.map((q) => <ExtraField key={q.key} q={q} ctx={ctx} />)}
          </div>
        ) : (
          <Review data={data} draft={draft} steps={steps} onEdit={goTo} packages={packages} />
        )}

        {step === 'review' && (
          <div className="mt-8 space-y-3 rounded-xl bg-cream-100 p-4 sm:p-5">
            <label className="flex items-start gap-3 text-sm text-navy-900">
              <input
                id="f-privacyConsent"
                type="checkbox"
                className="mt-0.5 size-4 accent-gold-600"
                checked={draft.privacyConsent === true}
                onChange={(e) => set('privacyConsent', e.target.checked)}
                aria-invalid={errors.privacyConsent ? true : undefined}
              />
              <span>
                Saya menyetujui{' '}
                <Link href="/kebijakan-privasi" target="_blank" className="font-semibold underline decoration-gold-400 underline-offset-2">
                  Kebijakan Privasi
                </Link>{' '}
                dan pemrosesan data pesanan ini.
              </span>
            </label>
            {errors.privacyConsent && <p className="pl-7 text-sm text-rose-700">{errors.privacyConsent}</p>}
            <label className="flex items-start gap-3 text-sm text-navy-900">
              <input
                id="f-dataConfirmed"
                type="checkbox"
                className="mt-0.5 size-4 accent-gold-600"
                checked={draft.dataConfirmed === true}
                onChange={(e) => set('dataConfirmed', e.target.checked)}
                aria-invalid={errors.dataConfirmed ? true : undefined}
              />
              <span>Saya menyatakan data di atas sudah benar.</span>
            </label>
            {errors.dataConfirmed && <p className="pl-7 text-sm text-rose-700">{errors.dataConfirmed}</p>}
          </div>
        )}

        {submitError && (
          <Alert tone="error" className="mt-6" title="Pesanan belum terkirim">
            {submitError}
          </Alert>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={() => goTo(steps[stepIndex - 1])} disabled={submitting}>
              <ArrowLeft className="size-4" aria-hidden /> Kembali
            </Button>
          ) : (
            <span />
          )}
          {step === 'review' ? (
            <Button onClick={submit} loading={submitting} size="lg" data-testid="submit-booking">
              <Send className="size-4" aria-hidden /> Kirim Pesanan
            </Button>
          ) : (
            <Button onClick={next} size="lg">
              {steps[stepIndex + 1] === 'review' ? 'Tinjau Pesanan' : 'Lanjut'} <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-muted">Isian tersimpan sementara di perangkat ini sampai pesanan terkirim.</p>
    </Container>
  );
}

function Review({ data, draft, steps, onEdit, packages }: { data: BookingFormData; draft: Draft; steps: StepId[]; onEdit: (s: StepId) => void; packages: BookingFormData['globalPackages'] }) {
  const display = (key: string, type: string): string => {
    const v = draft[key];
    if (typeof v !== 'string' || !v.trim()) return '';
    if (type === 'service') return data.services.find((s) => s.id === v)?.name ?? '';
    if (type === 'timezone') return tzLabel(v);
    if (type === 'date') return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${v}T00:00:00Z`));
    if (type === 'package') {
      const p = packages.find((x) => x.id === v);
      return p ? `${p.name} · ${formatDuration(p.durationMinutes)} · ${formatRupiah(p.price)}` : '';
    }
    return v;
  };
  const selectedPkg = packages.find((p) => p.id === draft.packageId);

  return (
    <div className="mt-6 space-y-6" data-testid="booking-preview">
      {steps
        .filter((s) => s !== 'review')
        .map((s) => {
          const rows = visibleFields(data.form, s)
            .map((f) => ({ label: f.label, value: display(f.key, f.type) }))
            .filter((r) => r.value);
          if (s === 'mc') {
            for (const q of data.form.extraQuestions) {
              const v = draft[extraKey(q.key)];
              if (v === undefined || v === '') continue;
              rows.push({ label: q.label, value: typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak') : v });
            }
          }
          return (
            <section key={s} className="rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="font-semibold text-navy-900">{sectionTitle(data.form, s)}</h3>
                <button type="button" onClick={() => onEdit(s)} className="inline-flex items-center gap-1 text-sm font-semibold text-gold-700 hover:text-navy-900">
                  <Pencil className="size-3.5" aria-hidden /> Ubah
                </button>
              </div>
              <dl className="divide-y divide-line/70 px-4">
                {rows.length ? (
                  rows.map((r) => (
                    <div key={r.label} className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                      <dt className="text-sm text-muted">{r.label}</dt>
                      <dd className="text-sm font-medium break-words whitespace-pre-line text-navy-900">{r.value}</dd>
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted">Tidak ada isian.</p>
                )}
              </dl>
            </section>
          );
        })}
      <div className="rounded-xl bg-navy-900 px-4 py-4 text-cream-50">
        <p className="text-sm text-cream-200/75">Estimasi biaya</p>
        <p className="mt-1 font-semibold">{selectedPkg ? formatRupiah(selectedPkg.price) : 'Dikonfirmasi oleh Hari Susanto setelah pesanan ditinjau'}</p>
        {selectedPkg && <p className="mt-1 text-xs text-cream-200/70">Biaya transportasi atau tambahan (jika ada) akan diinformasikan oleh Hari Susanto.</p>}
      </div>
    </div>
  );
}
