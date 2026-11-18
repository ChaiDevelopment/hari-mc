import { randomInt } from 'node:crypto';

// Crockford base32 tanpa karakter yang mudah tertukar (I, L, O, U)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Nomor booking yang mudah dibaca/diucapkan, mis. HMC-261117-7KQ2M (tanggal WIB). */
export function generateBookingCode(now: Date = new Date()): string {
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  const ymd = wib.toISOString().slice(2, 10).replace(/-/g, '');
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `HMC-${ymd}-${suffix}`;
}

export const BOOKING_CODE_RE = /^HMC-\d{6}-[0-9A-HJKMNP-TV-Z]{5}$/;
