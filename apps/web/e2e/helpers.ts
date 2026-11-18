import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

export const randomIp = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
export const uniqueEmail = (tag: string) => `${tag}-${randomUUID().slice(0, 8)}@example.com`;

/** Tanggal WIB N hari ke depan. */
export function futureDate(days: number): string {
  return new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Login cepat untuk test: endpoint dev-login API (hanya aktif di stack E2E/dev, tidak ada di UI maupun production)
 * memasang cookie sesi di konteks browser, lalu halaman dibuka seperti biasa.
 * Alur login sungguhan lewat UI diuji terpisah (kode email).
 */
export async function devLogin(page: Page, email: string, name: string, next = '/akun') {
  const r = await page.request.post('/api/v1/auth/dev-login', { data: { email, name, client: 'web' }, headers: { 'X-Forwarded-For': randomIp() } });
  expect(r.ok()).toBeTruthy();
  // Tunggu aplikasi selesai memulihkan sesi (rotasi refresh token) sebelum test melanjutkan;
  // reload/refresh paralel dengan token yang sama akan (sengaja) dianggap pencurian token.
  await Promise.all([page.waitForResponse((res) => res.url().includes('/api/v1/auth/refresh') && res.request().method() === 'POST'), page.goto(next)]);
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
}

/** Kode masuk terakhir untuk email tertentu dari kotak surat lokal API (EMAIL_TRANSPORT=log di stack E2E). */
export function readMailboxCode(email: string): string | null {
  const dir = 'D:/hari/apps/api/.storage-e2e/dev-mailbox';
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).sort().reverse();
  for (const f of files) {
    const msg = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { to: string; subject: string };
    if (msg.to === email.toLowerCase()) return /(\d{6})/.exec(msg.subject)?.[1] ?? null;
  }
  return null;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'halaman tidak boleh scroll horizontal').toBeLessThanOrEqual(0);
}

export async function snap(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `test-results/screens/${info.project.name}/${name}.png`, fullPage: true });
}

/** Membuat booking langsung via API sebagai user lain (untuk uji kepemilikan data). */
export async function createBookingViaApi(request: APIRequestContext, email: string) {
  const ip = randomIp();
  const login = await request.post('/api/v1/auth/dev-login', { data: { email, name: 'Pemilik Lain', client: 'android' }, headers: { 'X-Forwarded-For': ip } });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();
  const form = await (await request.get('/api/v1/booking-form')).json();
  const res = await request.post('/api/v1/bookings', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': ip },
    data: {
      contactName: 'Pemilik Lain',
      contactEmail: email,
      contactWhatsapp: '081298765432',
      eventName: 'Acara Rahasia Orang Lain',
      serviceId: form.services[0].id,
      eventDate: futureDate(45),
      startTime: '09:00',
      endTime: '11:00',
      timezone: 'Asia/Jakarta',
      venueName: 'Gedung Lain',
      address: 'Jl. Privat No. 9',
      city: 'Bandung',
      privacyConsent: true,
      dataConfirmed: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; code: string };
}
