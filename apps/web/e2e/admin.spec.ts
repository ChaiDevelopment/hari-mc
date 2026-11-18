import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { E2E_ADMIN_EMAIL } from './global-setup';
import { devLogin, expectNoHorizontalOverflow, futureDate, randomIp, snap, uniqueEmail } from './helpers';

const BASE = 'http://localhost:3499';
const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a59f0000000049454e44ae426082', 'hex');

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() });
});

async function adminLogin(page: Page, next = '/admin') {
  await page.goto(`/admin/masuk?next=${encodeURIComponent(next)}`);
  const form = page.getByTestId('dev-admin-login');
  await form.getByLabel('Email admin').fill(E2E_ADMIN_EMAIL);
  await form.getByRole('button', { name: /Masuk/ }).click();
  await page.waitForURL((u) => u.pathname === next);
}

/** Token admin & customer lewat API (untuk menyiapkan data dan membandingkan dengan database). */
async function apiLogin(req: APIRequestContext, email: string, name: string) {
  const r = await req.post('/api/v1/auth/dev-login', { data: { email, name, client: 'android' }, headers: { 'X-Forwarded-For': randomIp() } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).accessToken as string;
}

async function createBooking(req: APIRequestContext, token: string, over: Record<string, unknown> = {}) {
  const form = await (await req.get('/api/v1/booking-form')).json();
  const r = await req.post('/api/v1/bookings', {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID(), 'X-Forwarded-For': randomIp() },
    data: {
      contactName: 'Dewi Lestari',
      contactEmail: 'dewi@example.com',
      contactWhatsapp: '081277778888',
      eventName: 'Ulang Tahun Raka ke-5',
      serviceId: form.services[0].id,
      eventDate: futureDate(20),
      startTime: '10:00',
      endTime: '12:00',
      timezone: 'Asia/Jakarta',
      venueName: 'Aula Serbaguna',
      address: 'Jl. Melati No. 5, Gambir',
      city: 'Jakarta Pusat',
      privacyConsent: true,
      dataConfirmed: true,
      ...over,
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { id: string; code: string };
}

/** Offset tanggal per viewport: slot yang sudah diterima di satu project tidak boleh membuat project lain bentrok. */
const dayOffset = (project: string) => ({ 'desktop-1440': 0, 'tablet-768': 2, 'mobile-390': 4 })[project] ?? 6;

async function openMobileMenuIfNeeded(page: Page, project: string) {
  if (project !== 'desktop-1440') await page.getByRole('button', { name: 'Buka menu admin' }).click();
}

test.describe('Akses CMS', () => {
  test('pengunjung tanpa login diarahkan ke halaman masuk admin', async ({ page }, info) => {
    await page.goto('/admin/pesanan');
    await page.waitForURL(/\/admin\/masuk\?next=%2Fadmin%2Fpesanan/);
    await expect(page.getByRole('heading', { name: 'Masuk sebagai Admin' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-01-login');
  });

  test('pelanggan ditolak: halaman "Akses ditolak" dan API admin mengembalikan 403', async ({ page }, info) => {
    await devLogin(page, uniqueEmail('pelanggan'), 'Pelanggan Biasa', '/akun');
    await page.goto('/admin');
    await page.waitForURL(/\/admin\/tidak-diizinkan/);
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-hmc-csrf': '1' } });
      const { accessToken } = await r.json();
      return (await fetch('/api/v1/admin/dashboard', { headers: { Authorization: `Bearer ${accessToken}` } })).status;
    });
    expect(status).toBe(403);
    await snap(page, info, 'cms-02-unauthorized');
    await page.getByRole('button', { name: /Keluar & ganti akun/ }).click();
    await page.waitForURL(/\/admin\/masuk/);
  });
});

test.describe('CMS admin', () => {
  test('dashboard menampilkan angka yang sama dengan database', async ({ page, playwright }, info) => {
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, uniqueEmail('dash'), 'Pelanggan Dashboard');
    await createBooking(req, cust, { eventDate: futureDate(5) });

    await adminLogin(page);
    await expect(page.getByRole('heading', { name: 'Selamat datang, Hari Susanto' })).toBeVisible();
    const admin = await apiLogin(req, E2E_ADMIN_EMAIL, 'Hari Susanto');
    const db = await (await req.get('/api/v1/admin/dashboard', { headers: { Authorization: `Bearer ${admin}` } })).json();
    await req.dispose();

    const stats = page.getByTestId('admin-stats');
    const val = async (label: string) => (await stats.locator('div', { hasText: label }).first().locator('p').nth(1).innerText()).trim();
    expect(await val('Total booking')).toBe(String(db.counts.total));
    expect(await val('Menunggu persetujuan')).toBe(String(db.counts.byStatus.PENDING));
    expect(await val('Terkonfirmasi')).toBe(String(db.counts.byStatus.CONFIRMED));
    expect(await val('Acara mendatang')).toBe(String(db.counts.upcoming));
    await expect(page.getByTestId('agenda')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-03-dashboard');
  });

  test('kelola pesanan: cari → detail → terima → tetapkan biaya → minta pembayaran; pelanggan melihat statusnya', async ({ page, playwright }, info) => {
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, uniqueEmail('kelola'), 'Dewi Lestari');
    const b = await createBooking(req, cust, { eventDate: futureDate(45 + dayOffset(info.project.name)), startTime: '15:00', endTime: '17:00' });

    await adminLogin(page, '/admin/pesanan');
    await page.getByRole('searchbox', { name: 'Cari pesanan' }).fill(b.code);
    await page.getByRole('searchbox', { name: 'Cari pesanan' }).press('Enter');
    await expect(page.getByTestId('result-count')).toContainText('1 pesanan');
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-04-bookings');
    await page.getByTestId('admin-booking-row').filter({ visible: true }).first().click();

    await expect(page.getByTestId('booking-code')).toHaveText(b.code);
    await expect(page.getByText('Aula Serbaguna')).toBeVisible();
    await expect(page.getByText('0812-7777-8888')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-05-detail');

    // Terima (dengan dialog konfirmasi)
    await page.getByTestId('admin-actions').getByRole('button', { name: 'Terima pesanan' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Diterima' })).toBeVisible();
    await expect(page.getByTestId('status-badge').first()).toHaveText(/Diterima/);

    // Tetapkan rincian biaya — validasi DP > total ditolak server
    await page.getByTestId('edit-pricing').click();
    const pf = page.getByTestId('pricing-form');
    await pf.locator('input[name="packagePrice"]').fill('1500000');
    await pf.locator('input[name="transportFee"]').fill('200000');
    await pf.locator('input[name="depositAmount"]').fill('9000000');
    await pf.getByRole('button', { name: 'Simpan' }).click();
    await expect(pf.getByText('DP tidak boleh melebihi total')).toBeVisible();
    await pf.locator('input[name="depositAmount"]').fill('500000');
    await pf.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.getByTestId('price-total')).toContainText('1.700.000');

    await page.getByTestId('admin-actions').getByRole('button', { name: 'Minta pembayaran' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText(/Menunggu Pembayaran/);
    await expect(page.getByTestId('admin-timeline')).toContainText('Pesanan diterima');

    const mine = await (await req.get(`/api/v1/bookings/${b.id}`, { headers: { Authorization: `Bearer ${cust}` } })).json();
    expect(mine.status).toBe('WAITING_PAYMENT');
    expect(Number(mine.pricing.totalAmount)).toBe(1_700_000);
    await req.dispose();
  });

  test('tolak pesanan wajib alasan; minta perubahan tercatat', async ({ page, playwright }) => {
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, uniqueEmail('tolak'), 'Pelanggan Tolak');
    const b = await createBooking(req, cust, { eventDate: futureDate(46) });
    await adminLogin(page, `/admin/pesanan/${b.id}`);

    await page.getByRole('button', { name: 'Minta perubahan' }).click();
    await page.getByRole('dialog').getByRole('textbox').fill('Mohon kirim rundown lengkap');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('admin-timeline')).toContainText('Mohon kirim rundown lengkap');

    await page.getByTestId('admin-actions').getByRole('button', { name: 'Tolak pesanan' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('minimal');
    await page.getByRole('dialog').getByRole('textbox').fill('Sudah ada acara lain pada tanggal tersebut');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText(/Tidak Dapat Diterima/);
    await expect(page.getByTestId('admin-actions')).toHaveCount(0);

    const mine = await (await req.get(`/api/v1/bookings/${b.id}`, { headers: { Authorization: `Bearer ${cust}` } })).json();
    expect(mine.rejectionReason).toBe('Sudah ada acara lain pada tanggal tersebut');
    await req.dispose();
  });

  test('kalender: tampilan bulan/minggu/hari/agenda, klik event menampilkan detail', async ({ page, playwright }, info) => {
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, uniqueEmail('kalender'), 'Pelanggan Kalender');
    const eventName = `Kalender Uji ${randomUUID().slice(0, 6)}`;
    const b = await createBooking(req, cust, { eventDate: futureDate(3), startTime: '13:00', endTime: '15:00', eventName });
    await req.dispose();

    await adminLogin(page, '/admin/kalender');
    const cal = page.getByTestId('calendar');
    // Tampilan agenda mingguan; maju maksimal 2 minggu sampai acara terlihat
    await cal.getByRole('button', { name: 'Agenda', exact: true }).click();
    // Tunggu data minggu ini dimuat sebelum memutuskan pindah minggu (hindari race dengan fetch kalender)
    const visible = () => cal.getByText(eventName).waitFor({ timeout: 4000 }).then(() => true, () => false);
    for (let i = 0; i < 2 && !(await visible()); i++) await cal.locator('.fc-next-button').click();
    await cal.getByText(eventName).click();
    const detail = page.getByTestId('event-detail');
    await expect(detail).toContainText(b.code);
    await expect(detail).toContainText('13.00–15.00 WIB');
    await snap(page, info, 'cms-06-calendar-detail');
    await detail.getByRole('button', { name: 'Tutup' }).first().click();

    for (const view of ['Minggu', 'Hari', 'Agenda']) {
      await cal.getByRole('button', { name: view, exact: true }).click();
      await expect(cal.locator('.fc-view-harness')).toBeVisible();
    }
    await cal.getByRole('button', { name: 'Bulan', exact: true }).click();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-07-calendar');
  });

  test('pelanggan: cari & lihat riwayat', async ({ page, playwright }, info) => {
    const email = uniqueEmail('cari');
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, email, 'Rina Pelanggan');
    const b = await createBooking(req, cust, { eventDate: futureDate(60) });
    await req.dispose();

    await adminLogin(page, '/admin/pelanggan');
    await page.getByRole('searchbox', { name: 'Cari pelanggan' }).fill(email);
    await page.getByRole('searchbox', { name: 'Cari pelanggan' }).press('Enter');
    await expect(page.getByTestId('customer-row')).toHaveCount(1);
    await page.getByTestId('customer-row').click();
    await expect(page.getByRole('heading', { name: 'Rina Pelanggan' })).toBeVisible();
    await expect(page.getByText(b.code).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-08-customer');
  });

  test('pengaturan: paket baru tampil di website lalu diarsipkan; DP belum dikonfigurasi', async ({ page }, info) => {
    await adminLogin(page, '/admin/pengaturan');
    await expect(page.getByTestId('profile-form')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'cms-09-settings');

    await page.getByRole('tab', { name: 'DP & Transportasi' }).click();
    await expect(page.getByText('Belum dikonfigurasi').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Layanan & Paket' }).click();
    await page.getByTestId('add-package').click();
    const name = `Paket Uji ${randomUUID().slice(0, 5)}`;
    const form = page.getByTestId('package-form');
    await form.locator('input[name="name"]').fill(name);
    await form.locator('input[name="price"]').fill('0');
    await form.getByRole('button', { name: 'Simpan paket' }).click();
    await expect(form.getByText('Harga harus lebih dari 0')).toBeVisible();
    await form.locator('input[name="price"]').fill('1250000');
    await form.getByRole('button', { name: 'Simpan paket' }).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Paket ditambahkan' })).toBeVisible();
    await expect(page.getByTestId('package-list')).toContainText(name);

    try {
      const landing = await page.context().newPage();
      await landing.goto('/');
      await expect(landing.locator('#layanan')).toContainText('1.250.000');
      await landing.close();
    } finally {
      // Bersihkan agar tes landing Phase 2 ("tanpa harga") tetap valid
      await page.getByTestId('package-list').locator('li', { hasText: name }).getByRole('button', { name: `Arsipkan ${name}` }).click();
      await page.getByTestId('confirm-action').click();
      await expect(page.getByTestId('package-list')).toHaveCount(0);
    }
  });

  test('pembayaran: pelanggan unggah bukti transfer → Hari lihat bukti & verifikasi → otomatis terkonfirmasi', async ({ page, browser, playwright }, info) => {
    const email = uniqueEmail('bayar');
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, email, 'Sinta Bayar');
    const b = await createBooking(req, cust, { eventDate: futureDate(70 + dayOffset(info.project.name)) });
    const admin = await apiLogin(req, E2E_ADMIN_EMAIL, 'Hari Susanto');
    const H = { Authorization: `Bearer ${admin}`, 'X-Forwarded-For': randomIp() };
    expect((await req.post(`/api/v1/admin/bookings/${b.id}/transition`, { headers: H, data: { toStatus: 'ACCEPTED' } })).ok()).toBeTruthy();
    expect((await req.patch(`/api/v1/admin/bookings/${b.id}/pricing`, { headers: H, data: { packagePrice: 1_500_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 500_000 } })).ok()).toBeTruthy();
    expect((await req.post(`/api/v1/admin/bookings/${b.id}/transition`, { headers: H, data: { toStatus: 'WAITING_PAYMENT' } })).ok()).toBeTruthy();
    await req.dispose();

    // Pelanggan: melihat jumlah DP, mengunggah bukti
    await devLogin(page, email, 'Sinta Bayar', `/akun/pesanan/${b.id}`);
    await expect(page.getByTestId('amount-due')).toHaveText(/500\.000/);
    const form = page.getByTestId('payment-form');
    await form.locator('input[type="file"]').setInputFiles({ name: 'bukti.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(form.locator('input[name="amount"]')).toHaveValue('500000');
    await form.getByTestId('submit-payment').click();
    await expect(page.getByTestId('payment-pending')).toBeVisible();
    await expect(page.getByTestId('payment-history')).toContainText('Menunggu verifikasi');
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'pay-01-customer-submitted');

    // Hari: melihat bukti dan memverifikasi
    const u = info.project.use;
    const ctx = await browser.newContext({ baseURL: BASE, viewport: u.viewport, isMobile: u.isMobile, hasTouch: u.hasTouch, locale: 'id-ID', timezoneId: 'Asia/Jakarta', extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    const adminPage = await ctx.newPage();
    await adminLogin(adminPage, `/admin/pesanan/${b.id}`);
    const card = adminPage.getByTestId('admin-payments');
    await expect(card).toContainText('Menunggu verifikasi');
    await expect(adminPage.getByTestId('admin-actions').getByRole('button', { name: 'Konfirmasi pembayaran' })).toHaveCount(0);
    const [proofTab] = await Promise.all([ctx.waitForEvent('page'), card.getByRole('button', { name: 'Lihat bukti' }).click()]);
    await proofTab.waitForURL(/^blob:/);
    await proofTab.close();
    await snap(adminPage, info, 'pay-02-admin-pending');
    await card.getByTestId('verify-payment').click();
    await adminPage.getByTestId('confirm-action').click();
    await expect(adminPage.getByTestId('status-badge').first()).toHaveText(/Terkonfirmasi/);
    await expect(card).toContainText('Diterima');
    await ctx.close();

    // Pelanggan: status berubah, tagihan berikutnya = sisa pelunasan
    await page.reload();
    await expect(page.getByTestId('status-badge').first()).toHaveText(/Terkonfirmasi/);
    await expect(page.getByTestId('amount-due')).toHaveText(/1\.000\.000/);
    await expect(page.getByTestId('timeline')).toContainText('Pembayaran dikonfirmasi');
  });

  test('acara selesai → pelanggan diajak memberi ulasan di Google', async ({ page, playwright }, info) => {
    const email = uniqueEmail('ulasan');
    const req = await playwright.request.newContext({ baseURL: BASE });
    const cust = await apiLogin(req, email, 'Rudi Ulasan');
    const b = await createBooking(req, cust, { eventDate: futureDate(80 + dayOffset(info.project.name)) });
    const admin = await apiLogin(req, E2E_ADMIN_EMAIL, 'Hari Susanto');
    const H = { Authorization: `Bearer ${admin}`, 'X-Forwarded-For': randomIp() };
    const step = async (method: 'post' | 'patch', path: string, data: object) => expect((await req[method](path, { headers: H, data })).ok()).toBeTruthy();
    await step('post', `/api/v1/admin/bookings/${b.id}/transition`, { toStatus: 'ACCEPTED' });
    await step('patch', `/api/v1/admin/bookings/${b.id}/pricing`, { packagePrice: 1_000_000, transportFee: 0, additionalFee: 0, discountAmount: 0, depositAmount: 0 });
    await step('post', `/api/v1/admin/bookings/${b.id}/transition`, { toStatus: 'WAITING_PAYMENT' });
    await step('post', `/api/v1/admin/bookings/${b.id}/payments`, { amount: 1_000_000, method: 'CASH', paidAt: new Date().toISOString() });
    await step('post', `/api/v1/admin/bookings/${b.id}/transition`, { toStatus: 'IN_PROGRESS' });
    await step('post', `/api/v1/admin/bookings/${b.id}/transition`, { toStatus: 'COMPLETED' });
    await req.dispose();

    await devLogin(page, email, 'Rudi Ulasan', `/akun/pesanan/${b.id}`);
    const invite = page.getByTestId('review-invite');
    await expect(invite).toBeVisible();
    await expect(invite.getByRole('link', { name: /Beri ulasan di Google/ })).toHaveAttribute('href', 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9');
    await expect(page.getByTestId('status-badge').first()).toHaveText(/Selesai/);
    await expectNoHorizontalOverflow(page);
    await snap(page, info, 'review-01-invite');

    await page.goto('/akun');
    await expect(page.getByText('Acara selesai — bagikan pengalaman Anda').first()).toBeVisible();
  });

  test('navigasi CMS & logout', async ({ page }, info) => {
    await adminLogin(page);
    await openMobileMenuIfNeeded(page, info.project.name);
    await page.getByRole('navigation', { name: 'Menu CMS' }).filter({ visible: true }).getByRole('link', { name: 'Kalender', exact: true }).click();
    await page.waitForURL(/\/admin\/kalender/);
    await openMobileMenuIfNeeded(page, info.project.name);
    await page.getByRole('button', { name: 'Keluar' }).filter({ visible: true }).click();
    await page.waitForURL(/\/admin\/masuk/);
    await page.goto('/admin');
    await page.waitForURL(/\/admin\/masuk/);
  });
});
