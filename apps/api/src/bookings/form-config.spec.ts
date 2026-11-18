import { validateConfiguredRequired, validateFormAnswers, type BookingFormConfig } from './form-config';

const config: BookingFormConfig = {
  version: 1,
  verifiedAgainstOriginalForm: false,
  sections: [
    {
      id: 'event',
      title: 'Acara',
      fields: [
        { key: 'eventName', label: 'Nama acara', type: 'text', required: true, core: true },
        { key: 'guestCount', label: 'Jumlah tamu', type: 'number', required: true, core: true },
        { key: 'dressCode', label: 'Dress code', type: 'text', required: true, core: true, enabled: false },
        { key: 'rundown', label: 'Rundown', type: 'textarea', required: false, core: true },
      ],
    },
  ],
  extraQuestions: [
    { key: 'source', label: 'Tahu dari mana', type: 'select', options: ['Instagram', 'Teman'], required: true },
    { key: 'kids', label: 'Jumlah anak', type: 'number' },
    { key: 'agree', label: 'Setuju durasi', type: 'checkbox', required: true },
  ],
};

describe('validateConfiguredRequired', () => {
  it('field opsional yang dijadikan wajib oleh config harus diisi; field nonaktif diabaikan', () => {
    const errors = validateConfiguredRequired(config, { eventName: 'X' });
    expect(errors.map((e) => e.field)).toEqual(['guestCount']);
  });
  it('lolos jika terisi', () => {
    expect(validateConfiguredRequired(config, { guestCount: 50 })).toEqual([]);
  });
});

describe('validateFormAnswers', () => {
  it('menerima jawaban valid', () => {
    const r = validateFormAnswers(config, { source: 'Instagram', kids: 10, agree: true });
    expect(r.errors).toEqual([]);
    expect(r.clean).toEqual({ source: 'Instagram', kids: 10, agree: true });
  });
  it('menolak kunci tidak dikenal (tidak bisa menyisipkan data sembarang)', () => {
    const r = validateFormAnswers(config, { source: 'Teman', agree: true, isAdmin: true });
    expect(r.errors.map((e) => e.field)).toEqual(['formAnswers.isAdmin']);
  });
  it('wajib, tipe, dan opsi select divalidasi', () => {
    const r = validateFormAnswers(config, { source: 'TikTok', kids: '10', agree: false });
    expect(r.errors.map((e) => e.field).sort()).toEqual(['formAnswers.agree', 'formAnswers.kids', 'formAnswers.source']);
  });
  it('tanpa pertanyaan tambahan → objek kosong', () => {
    expect(validateFormAnswers({ ...config, extraQuestions: [] }, undefined)).toEqual({ clean: {}, errors: [] });
  });
});
