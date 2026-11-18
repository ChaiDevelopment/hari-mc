import type { BookingFormConfig, ExtraQuestion, FormFieldConfig } from './types';

/**
 * Logika form booking di sisi klien. Struktur, label, dan wajib/opsional berasal dari
 * business_settings.booking_form (API), sehingga form bisa disesuaikan dengan Google Form lama
 * tanpa mengubah kode. Validasi di sini hanya untuk kenyamanan — API tetap memvalidasi ulang.
 */

export type DraftValue = string | boolean;
export type Draft = Record<string, DraftValue>;
export type FieldErrors = Record<string, string>;

export const STEP_IDS = ['customer', 'event', 'mc', 'package', 'review'] as const;
export type StepId = (typeof STEP_IDS)[number];

export const STEP_TITLES: Record<StepId, string> = {
  customer: 'Data Pemesan',
  event: 'Detail Acara',
  mc: 'Kebutuhan MC',
  package: 'Paket',
  review: 'Tinjau & Kirim',
};

/** Field yang selalu wajib (sama dengan STRUCTURAL_REQUIRED di API). */
const STRUCTURAL = new Set([
  'contactName',
  'contactEmail',
  'contactWhatsapp',
  'eventName',
  'serviceId',
  'eventDate',
  'startTime',
  'endTime',
  'timezone',
  'venueName',
  'address',
  'city',
]);

const TZ_OFFSET: Record<string, number> = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };

export const extraKey = (key: string) => `extra.${key}`;

export function sectionTitle(config: BookingFormConfig, step: StepId): string {
  return config.sections.find((s) => s.id === step)?.title ?? STEP_TITLES[step];
}

export function visibleFields(config: BookingFormConfig, step: StepId): FormFieldConfig[] {
  const section = config.sections.find((s) => s.id === step);
  return (section?.fields ?? []).filter((f) => f.enabled !== false);
}

export function isRequired(field: FormFieldConfig): boolean {
  return STRUCTURAL.has(field.key) || field.required;
}

/** Nilai awal: default dari config + identitas Google + profil tersimpan. */
export function initialDraft(
  config: BookingFormConfig,
  prefill: { name?: string; email?: string; whatsapp?: string | null; city?: string | null },
): Draft {
  const d: Draft = {};
  for (const s of config.sections) for (const f of s.fields) if (f.default) d[f.key] = f.default;
  if (!d.timezone) d.timezone = 'Asia/Jakarta';
  if (prefill.name) d.contactName = prefill.name;
  if (prefill.email) d.contactEmail = prefill.email;
  if (prefill.whatsapp) d.contactWhatsapp = prefill.whatsapp.startsWith('+62') ? `0${prefill.whatsapp.slice(3)}` : prefill.whatsapp;
  if (prefill.city) d.city = prefill.city;
  return d;
}

const str = (v: DraftValue | undefined) => (typeof v === 'string' ? v.trim() : '');

export function localToUtcMs(date: string, time: string, tz: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  const off = TZ_OFFSET[tz];
  if (!d || !t || off === undefined) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const probe = new Date(Date.UTC(y, m - 1, day));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return null;
  return Date.UTC(y, m - 1, day, Number(t[1]) - off, Number(t[2]));
}

function validateField(field: FormFieldConfig, draft: Draft, rules: { minLeadTimeHours: number; maxAdvanceDays: number }, now: number): string | null {
  const v = str(draft[field.key]);
  if (!v) return isRequired(field) ? `${field.label} wajib diisi` : null;
  switch (field.key) {
    case 'contactName':
      return v.length < 2 ? 'Nama minimal 2 karakter' : null;
    case 'contactEmail':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Email tidak valid';
    case 'contactWhatsapp':
      return /^(\+?62|0)8[0-9]{7,12}$/.test(v.replace(/[\s-]/g, '')) ? null : 'Nomor WhatsApp tidak valid (contoh: 081234567890)';
    case 'mapsUrl':
      return /^https:\/\/\S+$/i.test(v) ? null : 'Link harus diawali https://';
    case 'guestCount':
      return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100000 ? null : 'Masukkan jumlah tamu (angka)';
    case 'address':
      return v.length < 5 ? 'Alamat terlalu pendek' : null;
    case 'eventDate': {
      const start = localToUtcMs(v, '00:00', str(draft.timezone) || 'Asia/Jakarta');
      if (start === null) return 'Tanggal tidak valid';
      if (start + 86_400_000 < now) return 'Tanggal acara sudah lewat';
      if (start > now + rules.maxAdvanceDays * 86_400_000) return `Pemesanan paling jauh ${rules.maxAdvanceDays} hari ke depan`;
      return null;
    }
    case 'startTime': {
      const start = localToUtcMs(str(draft.eventDate), v, str(draft.timezone) || 'Asia/Jakarta');
      if (start === null) return null; // tanggal belum valid → error ada di eventDate
      if (start < now + rules.minLeadTimeHours * 3_600_000) return `Pemesanan paling lambat ${rules.minLeadTimeHours} jam sebelum acara`;
      return null;
    }
    case 'endTime': {
      const tz = str(draft.timezone) || 'Asia/Jakarta';
      const s = localToUtcMs(str(draft.eventDate) || '2000-01-01', str(draft.startTime), tz);
      const e = localToUtcMs(str(draft.eventDate) || '2000-01-01', v, tz);
      if (s === null || e === null) return null;
      const minutes = (e - s) / 60_000;
      if (minutes <= 0) return 'Jam selesai harus setelah jam mulai';
      if (minutes < 30) return 'Durasi acara minimal 30 menit';
      if (minutes > 720) return 'Durasi acara maksimal 12 jam';
      return null;
    }
    default:
      return v.length > 5000 ? 'Teks terlalu panjang' : null;
  }
}

function validateExtra(q: ExtraQuestion, draft: Draft): string | null {
  const raw = draft[extraKey(q.key)];
  if (q.type === 'checkbox') return q.required && raw !== true ? `${q.label} wajib dicentang` : null;
  const v = str(raw);
  if (!v) return q.required ? `${q.label} wajib diisi` : null;
  if (q.type === 'number' && !Number.isFinite(Number(v))) return `${q.label} harus berupa angka`;
  if (q.type === 'select' && !(q.options ?? []).includes(v)) return `Pilih salah satu opsi`;
  if (v.length > 2000) return 'Teks terlalu panjang (maks. 2000 karakter)';
  return null;
}

export function validateStep(
  config: BookingFormConfig,
  step: StepId,
  draft: Draft,
  rules: { minLeadTimeHours: number; maxAdvanceDays: number },
  now: number = Date.now(),
): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 'review') {
    if (draft.privacyConsent !== true) errors.privacyConsent = 'Anda harus menyetujui kebijakan privasi';
    if (draft.dataConfirmed !== true) errors.dataConfirmed = 'Konfirmasi bahwa data sudah benar';
    return errors;
  }
  for (const f of visibleFields(config, step)) {
    const msg = validateField(f, draft, rules, now);
    if (msg) errors[f.key] = msg;
  }
  if (step === 'mc') {
    for (const q of config.extraQuestions) {
      const msg = validateExtra(q, draft);
      if (msg) errors[extraKey(q.key)] = msg;
    }
  }
  return errors;
}

/** Langkah tempat sebuah field berada (untuk melompat ke error dari server). */
export function stepOfField(config: BookingFormConfig, field: string): StepId {
  if (field.startsWith('formAnswers.')) return 'mc';
  if (field === 'privacyConsent' || field === 'dataConfirmed') return 'review';
  for (const s of config.sections) if (s.fields.some((f) => f.key === field)) return (STEP_IDS as readonly string[]).includes(s.id) ? (s.id as StepId) : 'event';
  return 'event';
}

/** Error server "formAnswers.x" → key draft "extra.x". */
export function draftKeyForServerField(field: string): string {
  return field.startsWith('formAnswers.') ? extraKey(field.slice('formAnswers.'.length)) : field;
}

export function buildPayload(config: BookingFormConfig, draft: Draft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const s of config.sections) {
    for (const f of s.fields) {
      if (f.enabled === false) continue;
      const v = str(draft[f.key]);
      if (!v) continue;
      payload[f.key] = f.key === 'guestCount' ? Number(v) : f.key === 'contactWhatsapp' ? v.replace(/[\s-]/g, '') : v;
    }
  }
  if (!payload.timezone) payload.timezone = 'Asia/Jakarta';
  const answers: Record<string, string | number | boolean> = {};
  for (const q of config.extraQuestions) {
    const raw = draft[extraKey(q.key)];
    if (q.type === 'checkbox') {
      if (typeof raw === 'boolean') answers[q.key] = raw;
      continue;
    }
    const v = str(raw);
    if (v) answers[q.key] = q.type === 'number' ? Number(v) : v;
  }
  if (Object.keys(answers).length) payload.formAnswers = answers;
  payload.privacyConsent = draft.privacyConsent === true;
  payload.dataConfirmed = draft.dataConfirmed === true;
  return payload;
}
