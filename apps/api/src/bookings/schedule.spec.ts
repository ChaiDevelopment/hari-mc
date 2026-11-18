import { DEFAULT_BOOKING_RULES, localToUtc, validateSchedule } from './schedule';

const NOW = new Date('2027-01-01T00:00:00Z');

describe('localToUtc', () => {
  it('mengonversi WIB/WITA/WIT ke UTC', () => {
    expect(localToUtc('2027-01-15', '10:00', 'Asia/Jakarta')!.toISOString()).toBe('2027-01-15T03:00:00.000Z');
    expect(localToUtc('2027-01-15', '10:00', 'Asia/Makassar')!.toISOString()).toBe('2027-01-15T02:00:00.000Z');
    expect(localToUtc('2027-01-15', '10:00', 'Asia/Jayapura')!.toISOString()).toBe('2027-01-15T01:00:00.000Z');
  });
  it('jam 05:00 WIB jatuh di hari sebelumnya dalam UTC', () => {
    expect(localToUtc('2027-01-15', '05:00', 'Asia/Jakarta')!.toISOString()).toBe('2027-01-14T22:00:00.000Z');
  });
  it('menolak tanggal/jam yang tidak ada', () => {
    expect(localToUtc('2027-02-30', '10:00', 'Asia/Jakarta')).toBeNull();
    expect(localToUtc('2027-01-15', '24:00', 'Asia/Jakarta')).toBeNull();
    expect(localToUtc('15-01-2027', '10:00', 'Asia/Jakarta')).toBeNull();
  });
});

describe('validateSchedule', () => {
  const ok = { eventDate: '2027-01-15', startTime: '10:00', endTime: '12:00', timezone: 'Asia/Jakarta' };
  const fields = (input: typeof ok) => validateSchedule(input, DEFAULT_BOOKING_RULES, NOW).errors.map((e) => e.field);

  it('jadwal valid tidak menghasilkan error', () => {
    expect(validateSchedule(ok, DEFAULT_BOOKING_RULES, NOW).errors).toEqual([]);
  });
  it('jam selesai sebelum/sama dengan jam mulai', () => {
    expect(fields({ ...ok, endTime: '09:00' })).toContain('endTime');
    expect(fields({ ...ok, endTime: '10:00' })).toContain('endTime');
  });
  it('durasi < 30 menit atau > 12 jam ditolak', () => {
    expect(fields({ ...ok, endTime: '10:15' })).toContain('endTime');
    expect(fields({ ...ok, startTime: '06:00', endTime: '19:00' })).toContain('endTime');
  });
  it('tanggal lampau ditolak', () => {
    expect(fields({ ...ok, eventDate: '2026-12-01' })).toContain('eventDate');
  });
  it('kurang dari lead time minimum ditolak', () => {
    expect(fields({ ...ok, eventDate: '2027-01-01', startTime: '20:00', endTime: '21:00' })).toContain('eventDate');
  });
  it('lebih dari batas hari maksimum ditolak', () => {
    expect(fields({ ...ok, eventDate: '2028-06-01' })).toContain('eventDate');
  });
  it('zona waktu di luar Indonesia ditolak', () => {
    expect(fields({ ...ok, timezone: 'Europe/London' })).toEqual(['timezone']);
  });
});
