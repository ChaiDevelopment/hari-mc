import { expect, test } from '@playwright/test';
import { createBookingViaApi, devLogin, expectNoHorizontalOverflow, futureDate, randomIp, readMailboxCode, snap, uniqueEmail } from './helpers';

test.beforeEach(async ({ page }) => {
  // IP unik per test agar rate limit (yang memang aktif) tidak saling mengganggu antar test.
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() });
});

test.describe('Landing page', () => {
  test('menampilkan data asli dari database, tanpa rating/ulasan buatan, dan responsif', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Buat Acara Anda Lebih Berkesan Bersama MC Profesional');
    await expect(page.getByText('Jasa MC Ultah Kak Hari').first()).toBeVisible();
    await expect(page.getByText('Gambir, Jakarta Pusat, Indonesia').first()).toBeVisible();

    const services = page.locator('#layanan li');
    await expect(services).toHaveCount(7);
    await expect(services.filter({ hasText: 'Sweet Seventeen' })).toBeVisible();

    // Ulasan & Instagram: tautan ke sumber asli, bukan angka buatan
    await expect(page.getByRole('link', { name: /Ulasan di Google/ })).toHaveAttribute('href', 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9');
    await expect(page.getByRole('link', { name: /Portfolio di Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/hari.jasamc/');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\b[1-5][.,]\d\s*(\/\s*5|bintang|★)/i);
    expect(body).not.toMatch(/Rp\s?\d/); // belum ada paket → tidak ada harga yang ditampilkan

    // FAQ dari database
    await page.getByText('Apakah pesanan langsung terkonfirmasi?').click();
    await expect(page.getByText(/Menunggu Konfirmasi/).first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await snap(page, info, '01-landing');
  });

  test('navigasi seluler membuka menu; CTA booking mengarah ke login bila belum masuk', async ({ page }, info) => {
    await page.goto('/');
    if (info.project.name !== 'desktop-1440') {
      await page.getByRole('button', { name: 'Buka menu' }).click();
      await expect(page.locator('#mobile-menu')).toBeVisible();
      await page.locator('#mobile-menu').getByRole('link', { name: 'Booking Sekarang' }).click();
    } else {
      await page.getByRole('banner').getByRole('link', { name: 'Booking Sekarang' }).click();
    }
    await page.waitForURL(/\/masuk\?next=%2Fpesan/);
    await expect(page.getByRole('heading', { name: 'Masuk atau daftar' })).toBeVisible();
    await expect(page.getByTestId('email-login')).toBeVisible();
    await expect(page.getByText('mode uji')).toHaveCount(0); // tidak ada lagi login uji di UI
    await expectNoHorizontalOverflow(page);
    await snap(page, info, '02-login');
  });
});

test.describe('Alur pemesanan pelanggan', () => {
  test('login → isi form → preview → kirim (klik ganda) → sukses → riwayat → detail status', async ({ page }, info) => {
    const email = uniqueEmail('budi');
    await devLogin(page, email, 'Budi Santoso', '/pesan');

    // Langkah 1: data pemesan terisi otomatis dari akun
    await expect(page.getByLabel(/Nama lengkap/)).toHaveValue('Budi Santoso');
    await expect(page.getByLabel(/^Email/)).toHaveValue(email);
    await snap(page, info, '03-form-step1');
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await expect(page.getByText('Nomor WhatsApp wajib diisi')).toBeVisible(); // validasi
    await page.getByLabel(/Nomor WhatsApp/).fill('0812-3456-7890');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Langkah 2: detail acara
    await expect(page.getByRole('heading', { name: 'Data Acara' })).toBeVisible();
    await page.getByLabel(/Nama acara/).fill('Ulang Tahun Alya ke-7');
    await page.getByText('Ulang Tahun Anak', { exact: true }).click();
    await page.getByLabel(/Tanggal acara/).fill(futureDate(30));
    await page.getByLabel(/Jam mulai/).fill('12:00');
    await page.getByLabel(/Jam selesai/).fill('10:00');
    await page.getByLabel(/Nama tempat acara/).fill('Rumah Keluarga');
    await page.getByLabel(/Alamat lengkap/).fill('Jl. Contoh No. 1, Gambir');
    await page.getByLabel(/^Kota/).fill('Jakarta Pusat');
    await page.getByLabel(/Estimasi jumlah tamu/).fill('40');
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await expect(page.getByText('Jam selesai harus setelah jam mulai')).toBeVisible(); // validasi jadwal
    await page.getByLabel(/Jam mulai/).fill('10:00');
    await page.getByLabel(/Jam selesai/).fill('12:00');
    await expectNoHorizontalOverflow(page);
    await snap(page, info, '04-form-event');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Langkah 3: kebutuhan MC (paket dilewati karena belum ada paket aktif)
    await page.getByLabel(/Bahasa acara/).selectOption('Bahasa Indonesia');
    await page.getByLabel(/Dress code/).fill('Batik');
    await page.getByLabel(/Rundown acara/).fill('10.00 Pembukaan\n10.30 Games\n11.30 Tiup lilin');
    await page.getByRole('button', { name: /Tinjau Pesanan/ }).click();

    // Langkah 4: preview
    const preview = page.getByTestId('booking-preview');
    await expect(preview).toContainText('Ulang Tahun Alya ke-7');
    await expect(preview).toContainText('Ulang Tahun Anak');
    await expect(preview).toContainText('081234567890'.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3'));
    await expect(preview).toContainText('Dikonfirmasi oleh Hari Susanto');
    await snap(page, info, '05-preview');

    await page.getByTestId('submit-booking').click();
    await expect(page.getByText('Anda harus menyetujui kebijakan privasi')).toBeVisible();
    await page.getByLabel(/Saya menyetujui/).check();
    await page.getByLabel(/Saya menyatakan data/).check();

    // Klik ganda super cepat (sebelum UI sempat menonaktifkan tombol)
    await page.getByTestId('submit-booking').evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });

    await page.waitForURL(/\/pesan\/berhasil\?id=/);
    const code = (await page.getByTestId('booking-code').innerText()).trim();
    expect(code).toMatch(/^HMC-\d{6}-[0-9A-Z]{5}$/);
    await expect(page.getByTestId('status-badge')).toHaveText(/Menunggu Konfirmasi/);
    await expectNoHorizontalOverflow(page);
    await snap(page, info, '06-success');

    // Riwayat: tepat satu pesanan walau tombol diklik dua kali
    await page.goto('/akun/pesanan');
    await expect(page.getByTestId('booking-card')).toHaveCount(1);
    await expect(page.getByTestId('booking-card')).toContainText(code);
    await snap(page, info, '07-history');

    // Detail & tracking status
    await page.getByTestId('booking-card').click();
    await expect(page.getByTestId('booking-code')).toHaveText(code);
    await expect(page.getByTestId('timeline')).toContainText('Pesanan dikirim');
    await expect(page.getByTestId('price-pending')).toBeVisible();
    await expect(page.getByText('Batik')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, '08-detail');

    // Dashboard menampilkan sapaan, acara berikutnya, dan notifikasi
    await page.goto('/akun');
    await expect(page.getByTestId('greeting')).toHaveText('Halo, Budi!');
    await expect(page.getByText('Ulang Tahun Alya ke-7').first()).toBeVisible();
    await expect(page.getByText('Pesanan terkirim').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await snap(page, info, '09-dashboard');
  });

  test('pelanggan dapat membatalkan pesanan PENDING; statusnya tercatat', async ({ page }) => {
    await devLogin(page, uniqueEmail('cancel'), 'Citra Batal', '/akun');
    const own = await createBookingForPageUser(page);
    await page.goto(`/akun/pesanan/${own}`);
    await page.getByRole('button', { name: /Batalkan pesanan/ }).click();
    await page.getByLabel('Alasan pembatalan').fill('Acara diundur oleh keluarga');
    await page.getByRole('button', { name: 'Ya, batalkan' }).click();
    await expect(page.getByTestId('status-badge')).toHaveText(/Dibatalkan/);
    await expect(page.getByTestId('timeline')).toContainText('Acara diundur oleh keluarga');
    await expect(page.getByRole('button', { name: /Batalkan pesanan/ })).toHaveCount(0);
  });
});

/** Buat booking milik user yang sedang login di page, lewat API yang sama dipakai web. */
async function createBookingForPageUser(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(async (date) => {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-hmc-csrf': '1' } });
    const { accessToken } = await refresh.json();
    const form = await (await fetch('/api/v1/booking-form')).json();
    const res = await fetch('/api/v1/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        contactName: 'Citra Batal',
        contactEmail: 'citra@example.com',
        contactWhatsapp: '081311112222',
        eventName: 'Gathering Kantor',
        serviceId: form.services[2].id,
        eventDate: date,
        startTime: '13:00',
        endTime: '15:00',
        timezone: 'Asia/Jakarta',
        venueName: 'Kantor',
        address: 'Jl. Kantor No. 2',
        city: 'Jakarta',
        privacyConsent: true,
        dataConfirmed: true,
      }),
    });
    return (await res.json()).id as string;
  }, futureDate(35));
}

test.describe('Masuk / daftar dengan email', () => {
  test('email → kode 6 digit → akun baru → lengkapi nama → masuk; kode salah ditolak', async ({ page }, info) => {
    const email = uniqueEmail('daftar');
    await page.goto('/masuk?next=%2Fakun');
    const box = page.getByTestId('email-login');
    await box.locator('input[name="email"]').fill(email);
    await box.getByRole('button', { name: 'Kirim kode masuk' }).click();
    await expect(box.getByText(`Kode dikirim ke ${email}`)).toBeVisible();
    await snap(page, info, '10-email-code');

    // Kode salah
    await box.locator('input[name="code"]').fill('000000' === readMailboxCode(email) ? '111111' : '000000');
    await box.getByRole('button', { name: 'Masuk' }).click();
    await expect(box.getByText(/Kode salah/)).toBeVisible();

    // Kode benar → akun baru → lengkapi profil
    const code = readMailboxCode(email);
    expect(code).toMatch(/^\d{6}$/);
    await box.locator('input[name="code"]').fill(code!);
    await box.getByRole('button', { name: 'Masuk' }).click();
    const profile = page.getByTestId('complete-profile');
    await expect(profile).toBeVisible();
    await profile.locator('input[name="name"]').fill('Maya Lestari');
    await profile.locator('input[name="whatsapp"]').fill('081255556666');
    await profile.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL((u) => u.pathname === '/akun');
    await expect(page.getByTestId('greeting')).toHaveText('Halo, Maya!');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Keamanan akses', () => {
  test('halaman akun & form mewajibkan login', async ({ page }) => {
    for (const path of ['/akun', '/akun/pesanan', '/pesan']) {
      await page.goto(path);
      await page.waitForURL(/\/masuk\?next=/);
    }
  });

  test('pelanggan tidak bisa membuka pesanan milik orang lain', async ({ page, playwright }) => {
    const other = await playwright.request.newContext({ baseURL: 'http://localhost:3499' });
    const foreign = await createBookingViaApi(other, uniqueEmail('owner'));
    await other.dispose();

    await devLogin(page, uniqueEmail('intruder'), 'Penyusup', '/akun');
    await page.goto(`/akun/pesanan/${foreign.id}`);
    await expect(page.getByText('Pesanan tidak ditemukan')).toBeVisible();
    await expect(page.getByText('Acara Rahasia Orang Lain')).toHaveCount(0);
    await page.goto('/akun/pesanan');
    await expect(page.getByText('Belum ada pesanan')).toBeVisible();
  });

  test('sesi bertahan setelah reload (refresh token cookie httpOnly, tidak terbaca JavaScript)', async ({ page, context }) => {
    await devLogin(page, uniqueEmail('sesi'), 'Sesi Uji', '/akun');
    await page.reload();
    await expect(page.getByTestId('greeting')).toHaveText('Halo, Sesi!');
    const cookies = await context.cookies();
    const rt = cookies.find((c) => c.name === 'hmc_rt');
    expect(rt?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('hmc_rt');
  });

  test('logout mencabut sesi: halaman akun kembali meminta login', async ({ page }, info) => {
    await devLogin(page, uniqueEmail('logout'), 'Keluar Uji', '/akun');
    if (info.project.name === 'desktop-1440') {
      await page.getByRole('button', { name: 'Keluar' }).click();
    } else {
      await page.getByRole('button', { name: 'Buka menu' }).click();
      await page.locator('#mobile-menu').getByRole('button', { name: 'Keluar' }).click();
    }
    await page.waitForURL((u) => u.pathname === '/');
    await page.goto('/akun');
    await page.waitForURL(/\/masuk\?next=%2Fakun/);
  });
});
