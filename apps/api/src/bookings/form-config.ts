import type { FieldError } from './schedule';

/**
 * Struktur form booking yang disimpan di business_settings.booking_form.
 * Google Form lama belum diverifikasi → label, wajib/opsional, dan pertanyaan tambahan dapat diubah tanpa deploy.
 */
export interface FormFieldConfig {
  key: string;
  label: string;
  type: string;
  required: boolean;
  core: boolean;
  enabled?: boolean;
  options?: string[];
  default?: string;
  helpText?: string;
}

export interface ExtraQuestion {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';
  required?: boolean;
  options?: string[];
  helpText?: string;
}

export interface BookingFormConfig {
  version: number;
  legacyFormUrl?: string;
  verifiedAgainstOriginalForm: boolean;
  sections: Array<{ id: string; title: string; fields: FormFieldConfig[] }>;
  extraQuestions: ExtraQuestion[];
}

/** Field yang secara struktural selalu wajib (kolom NOT NULL / dibutuhkan jadwal). Tidak bisa dibuat opsional lewat config. */
export const STRUCTURAL_REQUIRED = [
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
] as const;

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Field inti opsional yang dijadikan wajib oleh config harus terisi. */
export function validateConfiguredRequired(config: BookingFormConfig, payload: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const section of config.sections) {
    for (const f of section.fields) {
      if (!f.core || f.enabled === false || !f.required) continue;
      if ((STRUCTURAL_REQUIRED as readonly string[]).includes(f.key)) continue; // sudah divalidasi DTO
      if (isBlank(payload[f.key])) errors.push({ field: f.key, message: `${f.label} wajib diisi` });
    }
  }
  return errors;
}

const MAX_TEXT = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validasi jawaban pertanyaan tambahan terhadap definisi. Kunci yang tidak dikenal ditolak. */
export function validateFormAnswers(
  config: BookingFormConfig,
  answers: Record<string, unknown> | undefined,
): { clean: Record<string, string | number | boolean>; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const clean: Record<string, string | number | boolean> = {};
  const input = answers ?? {};
  const known = new Map(config.extraQuestions.map((q) => [q.key, q]));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) errors.push({ field: `formAnswers.${key}`, message: 'Pertanyaan tidak dikenal' });
  }
  for (const q of config.extraQuestions) {
    const v = input[q.key];
    const field = `formAnswers.${q.key}`;
    if (isBlank(v) || (q.type === 'checkbox' && v === false)) {
      if (q.required) errors.push({ field, message: `${q.label} wajib diisi` });
      if (q.type === 'checkbox' && v === false) clean[q.key] = false;
      continue;
    }
    switch (q.type) {
      case 'text':
      case 'textarea':
        if (typeof v !== 'string' || v.length > MAX_TEXT) errors.push({ field, message: `${q.label} tidak valid (maks. ${MAX_TEXT} karakter)` });
        else clean[q.key] = v.trim();
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push({ field, message: `${q.label} harus berupa angka` });
        else clean[q.key] = v;
        break;
      case 'select':
        if (typeof v !== 'string' || !(q.options ?? []).includes(v)) errors.push({ field, message: `Pilihan ${q.label} tidak valid` });
        else clean[q.key] = v;
        break;
      case 'checkbox':
        if (typeof v !== 'boolean') errors.push({ field, message: `${q.label} tidak valid` });
        else clean[q.key] = v;
        break;
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v)) errors.push({ field, message: `${q.label} harus berupa tanggal` });
        else clean[q.key] = v;
        break;
    }
  }
  return { clean, errors };
}
