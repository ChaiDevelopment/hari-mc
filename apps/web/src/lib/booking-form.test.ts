import { describe, expect, it } from 'vitest';
import { buildPayload, draftKeyForServerField, initialDraft, stepOfField, validateStep, visibleFields } from './booking-form';
import { safeNextPath, formatPhone, formatTimeRange, formatRupiah } from './format';
import type { BookingFormConfig } from './types';

const config: BookingFormConfig = {
  version: 1,
  verifiedAgainstOriginalForm: false,
  sections: [
    {
      id: 'customer',
      title: 'Data Pemesan',
      fields: [
        { key: 'contactName', label: 'Nama lengkap', type: 'text', required: true, core: true },
        { key: 'contactEmail', label: 'Email', type: 'email', required: true, core: true },
        { key: 'contactWhatsapp', label: 'Nomor WhatsApp', type: 'phone', required: true, core: true },
      ],
    },
    {
      id: 'event',
      title: 'Data Acara',
      fields: [
        { key: 'eventName', label: 'Nama acara', type: 'text', required: true, core: true },
        { key: 'serviceId', label: 'Kategori', type: 'service', required: true, core: true },
        { key: 'eventDate', label: 'Tanggal', type: 'date', required: true, core: true },
        { key: 'startTime', label: 'Jam mulai', type: 'time', required: true, core: true },
        { key: 'endTime', label: 'Jam selesai', type: 'time', required: true, core: true },
        { key: 'timezone', label: 'Zona waktu', type: 'timezone', required: true, core: true, default: 'Asia/Jakarta' },
        { key: 'venueName', label: 'Tempat', type: 'text', required: true, core: true },
        { key: 'address', label: 'Alamat', type: 'textarea', required: true, core: true },
        { key: 'mapsUrl', label: 'Maps', type: 'url', required: false, core: true },
        { key: 'city', label: 'Kota', type: 'text', required: true, core: true },
        { key: 'guestCount', label: 'Tamu', type: 'number', required: false, core: true },
      ],
    },
    {
      id: 'mc',
      title: 'Kebutuhan MC',
      fields: [
        { key: 'dressCode', label: 'Dress code', type: 'text', required: true, core: true },
        { key: 'rundown', label: 'Rundown', type: 'textarea', required: false, core: true, enabled: false },
      ],
    },
  ],
  extraQuestions: [{ key: 'source', label: 'Tahu dari mana', type: 'select', options: ['Instagram', 'Teman'], required: true }],
};
const rules = { minLeadTimeHours: 24, maxAdvanceDays: 365 };
const NOW = Date.parse('2027-01-01T00:00:00Z');

describe('form booking configurable', () => {
  it('mengisi otomatis identitas Google dan profil (WA lokal)', () => {
    const d = initialDraft(config, { name: 'Budi', email: 'budi@example.com', whatsapp: '+6281234567890', city: 'Jakarta' });
    expect(d).toMatchObject({ contactName: 'Budi', contactEmail: 'budi@example.com', contactWhatsapp: '081234567890', city: 'Jakarta', timezone: 'Asia/Jakarta' });
  });

  it('field nonaktif disembunyikan; field wajib dari config divalidasi', () => {
    expect(visibleFields(config, 'mc').map((f) => f.key)).toEqual(['dressCode']);
    const errs = validateStep(config, 'mc', {}, rules, NOW);
    expect(Object.keys(errs).sort()).toEqual(['dressCode', 'extra.source']);
  });

  it('validasi kontak', () => {
    const errs = validateStep(config, 'customer', { contactName: 'B', contactEmail: 'x', contactWhatsapp: '123' }, rules, NOW);
    expect(Object.keys(errs).sort()).toEqual(['contactEmail', 'contactName', 'contactWhatsapp']);
    expect(validateStep(config, 'customer', { contactName: 'Budi', contactEmail: 'b@e.co', contactWhatsapp: '0812 3456 7890' }, rules, NOW)).toEqual({});
  });

  it('validasi jadwal: lampau, lead time, jam terbalik, durasi', () => {
    const base = { eventName: 'Ultah', serviceId: 'x', timezone: 'Asia/Jakarta', venueName: 'Rumah', address: 'Jl. Satu', city: 'Jakarta' };
    const errs = (over: Record<string, string>) => validateStep(config, 'event', { ...base, ...over }, rules, NOW);
    expect(errs({ eventDate: '2026-12-01', startTime: '10:00', endTime: '12:00' }).eventDate).toMatch(/lewat/);
    expect(errs({ eventDate: '2027-01-01', startTime: '20:00', endTime: '22:00' }).startTime).toMatch(/24 jam/);
    expect(errs({ eventDate: '2027-01-15', startTime: '12:00', endTime: '10:00' }).endTime).toMatch(/setelah/);
    expect(errs({ eventDate: '2027-01-15', startTime: '10:00', endTime: '10:15' }).endTime).toMatch(/minimal/);
    expect(errs({ eventDate: '2027-01-15', startTime: '10:00', endTime: '12:00' })).toEqual({});
    expect(errs({ eventDate: '2027-01-15', startTime: '10:00', endTime: '12:00', mapsUrl: 'javascript:alert(1)' }).mapsUrl).toBeDefined();
  });

  it('langkah review mewajibkan dua persetujuan', () => {
    expect(Object.keys(validateStep(config, 'review', {}, rules, NOW)).sort()).toEqual(['dataConfirmed', 'privacyConsent']);
  });

  it('payload: hanya field aktif, angka dikonversi, jawaban tambahan di formAnswers', () => {
    const p = buildPayload(config, {
      contactName: ' Budi ',
      contactWhatsapp: '0812-3456-7890',
      guestCount: '40',
      rundown: 'tersembunyi',
      'extra.source': 'Instagram',
      privacyConsent: true,
      dataConfirmed: true,
    });
    expect(p).toMatchObject({ contactName: 'Budi', contactWhatsapp: '081234567890', guestCount: 40, formAnswers: { source: 'Instagram' }, privacyConsent: true });
    expect(p.rundown).toBeUndefined();
  });

  it('error server dipetakan ke langkah & field yang benar', () => {
    expect(stepOfField(config, 'startTime')).toBe('event');
    expect(stepOfField(config, 'formAnswers.source')).toBe('mc');
    expect(draftKeyForServerField('formAnswers.source')).toBe('extra.source');
  });
});

describe('format', () => {
  it('rentang waktu dalam zona acara', () => {
    expect(formatTimeRange('2027-01-15T03:00:00Z', '2027-01-15T05:00:00Z', 'Asia/Jakarta')).toBe('10.00–12.00 WIB');
    expect(formatTimeRange('2027-01-15T03:00:00Z', '2027-01-15T05:00:00Z', 'Asia/Makassar')).toBe('11.00–13.00 WITA');
  });
  it('rupiah & telepon', () => {
    expect(formatRupiah('1500000')).toMatch(/1\.500\.000/);
    expect(formatPhone('+6281234567890')).toBe('0812-3456-7890');
  });
  it('redirect setelah login hanya ke path internal', () => {
    expect(safeNextPath('/pesan')).toBe('/pesan');
    expect(safeNextPath('//evil.example')).toBe('/akun');
    expect(safeNextPath('https://evil.example')).toBe('/akun');
    expect(safeNextPath('/\\evil.example')).toBe('/akun');
    expect(safeNextPath(null)).toBe('/akun');
  });
});
