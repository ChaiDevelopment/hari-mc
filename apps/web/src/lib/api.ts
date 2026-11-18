'use client';

import type { PublicUser } from './types';

/**
 * Klien API browser.
 * - Access token hanya di memori (tidak di localStorage).
 * - Refresh token = cookie httpOnly; refresh selalu single-flight dan diserialisasi lintas tab
 *   (Web Locks) karena API mendeteksi pemakaian ulang refresh token dan mencabut sesi.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: Array<{ field: string; message: string }> = [],
    public code?: string,
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  user: PublicUser;
}

let accessToken: string | null = null;
let refreshPromise: Promise<Session | null> | null = null;
const listeners = new Set<(s: Session | null) => void>();

export function onSessionChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSession(s: Session | null) {
  accessToken = s?.accessToken ?? null;
  listeners.forEach((fn) => fn(s));
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { message?: string | string[]; errors?: Array<{ field: string; message: string }>; code?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* bukan JSON */
  }
  const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  const fallback =
    res.status === 429 ? 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' : res.status >= 500 ? 'Terjadi gangguan pada server. Coba beberapa saat lagi.' : 'Permintaan gagal';
  return new ApiError(res.status, msg ?? fallback, body.errors ?? [], body.code);
}

async function doRefresh(): Promise<Session | null> {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-hmc-csrf': '1' }, credentials: 'same-origin' });
  if (!res.ok) return null;
  return (await res.json()) as Session;
}

/** Satu refresh pada satu waktu (dalam tab: promise bersama; antar tab: navigator.locks). */
export function refreshSession(): Promise<Session | null> {
  if (!refreshPromise) {
    const run = async () => {
      try {
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
        const session = locks ? await locks.request('hmc-refresh', doRefresh) : await doRefresh();
        setSession(session);
        return session;
      } catch {
        setSession(null);
        return null;
      } finally {
        refreshPromise = null;
      }
    };
    refreshPromise = run();
  }
  return refreshPromise;
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** default true: lampirkan access token dan coba refresh sekali jika 401 */
  auth?: boolean;
}

export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = opts;
  const send = () =>
    fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && auth) {
    const session = await refreshSession();
    if (session) res = await send();
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Upload file (multipart). Validasi tipe & ukuran sesungguhnya dilakukan server (magic bytes, maks. 5 MB). */
export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const send = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('file', file);
    return fetch(`/api/v1${path}`, { method: 'POST', credentials: 'same-origin', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, body: fd });
  };
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (res.status === 413) throw new ApiError(413, 'Ukuran file melebihi 5 MB');
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/**
 * Buka file privat (mis. bukti transfer) yang butuh token. Tab dibuka lebih dulu secara sinkron
 * agar tidak diblokir popup blocker, lalu diarahkan ke blob setelah file diunduh.
 */
export async function openPrivateFile(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const send = () => fetch(`/api/v1${path}`, { credentials: 'same-origin', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    let res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
    if (!res.ok) throw await parseError(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (blob.type === 'application/pdf') {
      // PDF diunduh (CSP object-src 'none' ikut berlaku pada dokumen blob dan dapat memblokir PDF viewer).
      tab?.close();
      const a = document.createElement('a');
      a.href = url;
      a.download = `bukti-pembayaran.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export async function loginWithGoogle(idToken: string): Promise<Session> {
  const session = await api<Session>('/auth/google', { method: 'POST', body: { idToken, client: 'web' }, auth: false });
  setSession(session);
  return session;
}

export async function loginDev(email: string, name: string): Promise<Session> {
  const session = await api<Session>('/auth/dev-login', { method: 'POST', body: { email, name, client: 'web' }, auth: false });
  setSession(session);
  return session;
}

/**
 * Cabut sesi di server lalu muat ulang ke beranda. Navigasi penuh (bukan setSession(null) dulu) agar
 * guard halaman akun tidak sempat mengalihkan ke /masuk, dan semua state di memori ikut bersih.
 */
export async function logout(redirectTo = '/'): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'x-hmc-csrf': '1' }, credentials: 'same-origin' });
  } finally {
    accessToken = null;
    window.location.assign(redirectTo);
  }
}
