import type { BookingStatus } from './types';

const TZ_LABEL: Record<string, string> = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' };

export function tzLabel(tz: string): string {
  return TZ_LABEL[tz] ?? tz;
}

/** "Jumat, 15 Januari 2027" pada zona waktu acara. */
export function formatDate(iso: string, timeZone = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));
}

export function formatShortDate(iso: string, timeZone = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

/** "10.00" pada zona waktu acara. */
export function formatTime(iso: string, timeZone = 'Asia/Jakarta'): string {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(iso));
}

/** "10.00–12.00 WIB" */
export function formatTimeRange(startIso: string, endIso: string, timeZone = 'Asia/Jakarta'): string {
  return `${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)} ${tzLabel(timeZone)}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date(iso)) + ' WIB';
}

export function formatRupiah(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} jam ${m} menit`;
  if (h) return `${h} jam`;
  return `${m} menit`;
}

/** "Budi Santoso" → "Budi" */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "+6281234567890" → "0812-3456-7890" */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '-';
  const local = e164.startsWith('+62') ? `0${e164.slice(3)}` : e164;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

export type StatusTone = 'amber' | 'blue' | 'violet' | 'green' | 'navy' | 'gray' | 'red';

export const STATUS_META: Record<BookingStatus, { label: string; tone: StatusTone; description: string }> = {
  PENDING: { label: 'Menunggu Konfirmasi', tone: 'amber', description: 'Hari Susanto sedang meninjau jadwal dan kebutuhan acara Anda.' },
  ACCEPTED: { label: 'Diterima', tone: 'blue', description: 'Pesanan diterima. Rincian biaya dan pembayaran akan diinformasikan.' },
  WAITING_PAYMENT: { label: 'Menunggu Pembayaran', tone: 'violet', description: 'Silakan lakukan pembayaran lalu kirim bukti transfer. Pesanan terkonfirmasi setelah Hari Susanto memverifikasi dana masuk.' },
  CONFIRMED: { label: 'Terkonfirmasi', tone: 'green', description: 'Jadwal sudah dikunci. Sampai jumpa di acara Anda!' },
  IN_PROGRESS: { label: 'Sedang Berlangsung', tone: 'navy', description: 'Acara sedang berlangsung.' },
  COMPLETED: { label: 'Selesai', tone: 'green', description: 'Acara telah selesai. Terima kasih telah mempercayakan acara Anda.' },
  REJECTED: { label: 'Tidak Dapat Diterima', tone: 'red', description: 'Mohon maaf, pesanan ini tidak dapat diterima.' },
  CANCELLED: { label: 'Dibatalkan', tone: 'gray', description: 'Pesanan ini telah dibatalkan.' },
  REFUNDED: { label: 'Dana Dikembalikan', tone: 'gray', description: 'Dana untuk pesanan ini telah dikembalikan.' },
};

/** Langkah utama yang ditampilkan di progress tracker. */
export const MAIN_FLOW: BookingStatus[] = ['PENDING', 'ACCEPTED', 'WAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

export const ACTION_LABEL: Record<string, string> = {
  SUBMIT: 'Pesanan dikirim',
  ACCEPT: 'Pesanan diterima',
  REJECT: 'Pesanan tidak dapat diterima',
  REQUEST_PAYMENT: 'Menunggu pembayaran',
  CONFIRM_PAYMENT: 'Pembayaran dikonfirmasi',
  START_EVENT: 'Acara dimulai',
  COMPLETE_EVENT: 'Acara selesai',
  CANCEL: 'Pesanan dibatalkan',
  REFUND: 'Dana dikembalikan',
  REQUEST_CHANGES: 'Permintaan perubahan',
};

export const ACTOR_LABEL = { CUSTOMER: 'Anda', ADMIN: 'Hari Susanto', SYSTEM: 'Sistem' } as const;

/** Hanya izinkan redirect internal setelah login (mencegah open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = '/akun'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

export const PAYMENT_TYPE_LABEL: Record<string, string> = { DOWN_PAYMENT: 'DP', SETTLEMENT: 'Pelunasan', REFUND: 'Pengembalian dana' };
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Transfer bank',
  E_WALLET: 'E-wallet',
  QRIS: 'QRIS',
  CASH: 'Tunai',
  PAYMENT_GATEWAY: 'Payment gateway',
  OTHER: 'Lainnya',
};
export const PAYMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Menunggu verifikasi', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  VERIFIED: { label: 'Diterima', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  REJECTED: { label: 'Ditolak', className: 'bg-rose-50 text-rose-800 ring-rose-200' },
  REFUNDED: { label: 'Dikembalikan', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
};
