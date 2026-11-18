/**
 * Konversi & validasi jadwal acara.
 * Zona waktu dibatasi ke tiga zona Indonesia (tanpa daylight saving) agar konversi selalu tepat.
 */
export const SUPPORTED_TIMEZONES = {
  'Asia/Jakarta': { offsetHours: 7, label: 'WIB' },
  'Asia/Makassar': { offsetHours: 8, label: 'WITA' },
  'Asia/Jayapura': { offsetHours: 9, label: 'WIT' },
} as const;

export type SupportedTimezone = keyof typeof SUPPORTED_TIMEZONES;

export interface BookingRules {
  travelBufferMinutes: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
}

export const DEFAULT_BOOKING_RULES: BookingRules = { travelBufferMinutes: 60, minLeadTimeHours: 24, maxAdvanceDays: 365 };

export const MIN_EVENT_MINUTES = 30;
export const MAX_EVENT_MINUTES = 12 * 60;

export interface FieldError {
  field: string;
  message: string;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Waktu lokal (tanggal + jam pada zona tertentu) → Date UTC. Mengembalikan null bila tidak valid. */
export function localToUtc(date: string, time: string, timezone: SupportedTimezone): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const probe = new Date(Date.UTC(y, m - 1, day));
  // Tolak tanggal yang "dinormalisasi" JS, mis. 2027-02-30 → 2027-03-02
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return null;
  const offset = SUPPORTED_TIMEZONES[timezone].offsetHours;
  return new Date(Date.UTC(y, m - 1, day, Number(t[1]) - offset, Number(t[2])));
}

export interface ScheduleInput {
  eventDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

export function validateSchedule(
  input: ScheduleInput,
  rules: BookingRules,
  now: Date = new Date(),
): { start: Date; end: Date; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const tz = input.timezone as SupportedTimezone;
  if (!(input.timezone in SUPPORTED_TIMEZONES)) {
    return { start: new Date(NaN), end: new Date(NaN), errors: [{ field: 'timezone', message: 'Zona waktu tidak didukung' }] };
  }
  if (!localToUtc(input.eventDate, '00:00', tz)) {
    return { start: new Date(NaN), end: new Date(NaN), errors: [{ field: 'eventDate', message: 'Tanggal acara tidak valid' }] };
  }
  const start = localToUtc(input.eventDate, input.startTime, tz);
  const end = localToUtc(input.eventDate, input.endTime, tz);
  if (!start) errors.push({ field: 'startTime', message: 'Jam mulai tidak valid' });
  if (!end) errors.push({ field: 'endTime', message: 'Jam selesai tidak valid' });
  if (!start || !end) return { start: start ?? new Date(NaN), end: end ?? new Date(NaN), errors };

  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (minutes <= 0) errors.push({ field: 'endTime', message: 'Jam selesai harus setelah jam mulai' });
  else if (minutes < MIN_EVENT_MINUTES) errors.push({ field: 'endTime', message: `Durasi acara minimal ${MIN_EVENT_MINUTES} menit` });
  else if (minutes > MAX_EVENT_MINUTES) errors.push({ field: 'endTime', message: 'Durasi acara maksimal 12 jam' });

  const earliest = now.getTime() + rules.minLeadTimeHours * 3_600_000;
  const latest = now.getTime() + rules.maxAdvanceDays * 86_400_000;
  if (start.getTime() < now.getTime()) errors.push({ field: 'eventDate', message: 'Tanggal acara sudah lewat' });
  else if (start.getTime() < earliest) {
    errors.push({ field: 'eventDate', message: `Pemesanan paling lambat ${rules.minLeadTimeHours} jam sebelum acara` });
  } else if (start.getTime() > latest) {
    errors.push({ field: 'eventDate', message: `Pemesanan paling jauh ${rules.maxAdvanceDays} hari ke depan` });
  }
  return { start, end, errors };
}
