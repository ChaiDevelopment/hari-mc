# Phase 2 — Customer Web: Laporan

Tanggal: 17 November 2026

## Ringkasan
Pelanggan kini dapat membuka website, login, mengisi form booking, mengirim pesanan ke PostgreSQL, dan memantau statusnya. Semuanya memakai backend dan database Fase 1 yang sama, tanpa mock API.

Login Google sudah terpasang (Google Identity Services + verifikasi di API), tetapi baru aktif setelah `GOOGLE_CLIENT_IDS` diisi. Selama itu, login uji **khusus development** tersedia. Login uji ini ditolak keras di production.

## 1. File yang dibuat / diubah

### Backend (`apps/api`) — penambahan, tanpa mengubah alur keamanan Fase 1
| File | Status | Isi |
|---|---|---|
| `src/bookings/booking-status.ts` | baru | Tabel transisi status (sumber kebenaran), aksi yang diizinkan customer |
| `src/bookings/schedule.ts` | baru | Konversi WIB/WITA/WIT → UTC, validasi tanggal/jam/lead time/durasi |
| `src/bookings/form-config.ts` | baru | Validasi form configurable (field wajib dari settings, pertanyaan tambahan) |
| `src/bookings/booking-code.ts` | baru | Nomor booking `HMC-YYMMDD-XXXXX` |
| `src/bookings/dto/create-booking.dto.ts` | baru | DTO booking + pembatalan |
| `src/bookings/bookings.service.ts` / `.controller.ts` / `.module.ts` | baru | Submit (idempoten), cek slot, snapshot harga, riwayat, ringkasan, detail, pembatalan |
| `src/notifications/*` | baru | Notifikasi in-app (dedupe), list, tandai dibaca |
| `src/settings/*` | baru | `SettingsService`, endpoint publik `/site` dan `/booking-form` |
| `src/auth/auth.controller.ts`, `auth.service.ts`, `dto/auth.dto.ts` | diubah | **Tambahan**: `GET /auth/config`, `POST /auth/dev-login` (+ guard 404 jika nonaktif) |
| `src/config/env.ts` | diubah | `ENABLE_DEV_LOGIN` (ditolak saat `NODE_ENV=production`) |
| `src/app.module.ts` | diubah | Registrasi modul baru |
| `prisma/seed.ts` | diubah | Setting `faq`, hanya menjelaskan alur platform |
| `.env.example` | diubah | `ENABLE_DEV_LOGIN`, CORS ke port web 3400 |
| `src/bookings/*.spec.ts`, `src/config/env.spec.ts` | baru/diubah | Unit test |
| `test/bookings.e2e-spec.ts` | baru | Integration test booking, kepemilikan, dev login |
| `test/utils.ts`, `test/global-setup.ts` | diubah | Override env per test; `ENABLE_DEV_LOGIN=false` eksplisit |

Tidak ada perubahan pada schema/migration. Semua constraint database Fase 1 tetap utuh.

### Frontend (`apps/web`) — baru
| Path | Isi |
|---|---|
| `src/app/page.tsx` | Landing page (data dari `/site`) |
| `src/app/masuk/*` | Login: tombol Google + form dev login (jika aktif) |
| `src/app/pesan/page.tsx`, `booking-wizard.tsx` | Form booking multi-langkah + preview |
| `src/app/pesan/berhasil/page.tsx` | Halaman sukses + nomor booking |
| `src/app/akun/page.tsx` | Dashboard customer |
| `src/app/akun/pesanan/page.tsx` | Riwayat pesanan (Semua/Mendatang/Riwayat, paginasi) |
| `src/app/akun/pesanan/[id]/page.tsx` | Detail, tracker status, timeline, pembatalan |
| `src/app/akun/profil/page.tsx` | Edit profil (WA, kota) |
| `src/app/kebijakan-privasi/page.tsx`, `not-found.tsx` | Kebijakan privasi, 404 |
| `src/app/api/v1/[...path]/route.ts` | Proxy same-origin ke API |
| `src/lib/api.ts`, `auth.tsx` | Klien API (refresh single-flight + Web Locks lintas tab), auth context |
| `src/lib/booking-form.ts`, `format.ts`, `types.ts`, `server-api.ts` | Logika form, format Indonesia, tipe |
| `src/components/*` | Design system, header/footer, kartu, field form |
| `next.config.ts` | CSP + security headers |
| `e2e/*`, `playwright.config.ts` | E2E full-stack terisolasi, 3 viewport |
| `src/lib/booking-form.test.ts`, `vitest.config.ts` | Unit test web |

## 2. Fitur yang berhasil
- **Landing page**: hero dengan headline sesuai brief, tentang, layanan (7 kategori dari DB), cara pemesanan, portfolio/ulasan (tautan ke Instagram dan Google Maps asli), FAQ dari DB, kontak, dan footer.
  - Foto profil memakai `mc_profile.photo_url`. Selama belum diunggah, yang tampil monogram, bukan foto stok.
- **Login**:
  - Tombol resmi Google, aktif otomatis saat Client ID diisi.
  - Sesi dipulihkan dari cookie httpOnly setelah reload.
  - Logout.
  - Redirect `?next=` divalidasi agar tidak bisa dipakai untuk open redirect.
- **Dashboard**: sapaan, statistik (total/aktif/selesai), acara berikutnya, 3 pesanan terbaru, notifikasi (tandai dibaca), dan kartu profil.
- **Form booking**:
  - 4–5 langkah, mobile-first. Label, wajib/opsional, dan pertanyaan tambahan berasal dari `business_settings.booking_form`.
  - Nama, email, WA, dan kota terisi otomatis dari akun/profil.
  - Draft tetap tersimpan saat halaman di-refresh.
  - Langkah "Paket" otomatis muncul jika Hari sudah membuat paket.
- **Preview** dengan tombol "Ubah" per bagian, serta dua persetujuan (kebijakan privasi dan kebenaran data).
- **Submit ke database**:
  - Transaksi tunggal yang mencakup booking, detail acara, log status, audit, dan notifikasi customer + admin.
  - Idempotency key per sesi form, sehingga klik ganda atau jaringan putus lalu kirim ulang tidak membuat booking ganda.
- **Halaman sukses** dengan nomor booking (bisa disalin/cetak).
- **Riwayat & detail**: tracker 6 tahap, timeline status (aktor + catatan), rincian biaya (atau "menunggu konfirmasi" bila harga belum ditetapkan), dan pembatalan oleh customer untuk status PENDING/ACCEPTED/WAITING_PAYMENT.

## 3. Endpoint yang digunakan
| Endpoint | Akses | Dipakai di |
|---|---|---|
| `GET /site` | Publik | Landing, kebijakan privasi |
| `GET /booking-form` | Publik | Form booking |
| `GET /auth/config` | Publik | Halaman masuk |
| `POST /auth/google` (Fase 1) | Publik | Login Google |
| `POST /auth/dev-login` | Publik, **hanya jika `ENABLE_DEV_LOGIN=true` & bukan production** | Login uji |
| `POST /auth/refresh`, `POST /auth/logout` (Fase 1) | Cookie + header CSRF | Sesi |
| `GET /me/profile`, `PATCH /me/profile` (Fase 1) | Customer | Autofill, profil |
| `POST /bookings` (header `Idempotency-Key`) | Customer | Submit |
| `GET /bookings?scope=&status=&page=&pageSize=` | Customer (milik sendiri) | Riwayat, dashboard |
| `GET /bookings/summary` | Customer | Dashboard |
| `GET /bookings/:id` | Customer (milik sendiri, selain itu 404) | Sukses, detail |
| `POST /bookings/:id/cancel` | Customer | Detail |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Login (milik sendiri) | Dashboard |

## 4. Hasil pengujian
| Suite | Hasil |
|---|---|
| API unit (Fase 1 + Fase 2: jadwal & zona waktu, form configurable, transisi status, nomor booking, env) | **35/35** |
| API e2e Fase 1 (auth, RBAC, database), dijalankan ulang tanpa perubahan | **35/35** |
| API e2e Fase 2 (booking, idempotensi, validasi, slot & buffer, snapshot harga, form configurable, kepemilikan, notifikasi, pembatalan, data publik, dev login) | **35/35** |
| Web unit (vitest: logika form, format, redirect aman) | **10/10** |
| Web E2E Playwright, full stack nyata × 3 viewport (desktop 1440, tablet 768, mobile 390) | **24/24** (8 skenario × 3) |
| **Total** | **139/139** |

Skenario E2E browser yang diuji di setiap viewport:
- Landing tampil tanpa scroll horizontal, tanpa harga/rating buatan.
- Menu seluler bekerja, dan CTA mengarah ke login.
- Alur lengkap: login → validasi (WA kosong, jam terbalik) → preview → wajib persetujuan → **klik submit ganda menghasilkan tepat 1 pesanan** → sukses → riwayat → detail → dashboard.
- Pembatalan.
- Halaman akun wajib login.
- **Pesanan milik orang lain tidak dapat dibuka** ("Pesanan tidak ditemukan").
- Sesi bertahan setelah reload, dan cookie `hmc_rt` httpOnly tidak terbaca JavaScript.
- Logout mencabut sesi.

Pengujian integrasi API juga mencakup:
- 5 submit paralel dengan key yang sama → 1 booking dan 1 notifikasi.
- Jadwal lampau, kurang dari 24 jam, tanggal tidak ada, jam terbalik, dan zona waktu asing ditolak.
- Slot yang sudah terkonfirmasi (termasuk jeda perjalanan 60 menit) ditolak tanpa membocorkan data pelanggan lain.
- Mass assignment (`status`, `totalAmount`) ditolak.
- Link `javascript:` ditolak.
- Customer lain mendapat 404 untuk detail/pembatalan pesanan dan notifikasi orang lain.

Screenshot per viewport tersimpan di `apps/web/test-results/screens/`.

### Masalah yang ditemukan & diperbaiki
1. Error tanggal tidak valid (mis. 30 Feb) tercatat pada field yang salah → sekarang tercatat di `eventDate`.
2. Endpoint dev login yang nonaktif masih menjalankan validasi body (400) sehingga keberadaannya terlihat → sekarang guard mengembalikan 404 sebelum validasi.
3. Prisma otomatis memuat `apps/api/.env` ke proses test sehingga `ENABLE_DEV_LOGIN` dari dev ikut bocor → nilai test kini ditetapkan eksplisit.
4. **Bug UX logout**: menekan "Keluar" di halaman akun mengarah ke `/masuk`, bukan beranda → logout sekarang mencabut sesi lalu memuat ulang beranda.
5. Port 3000 dan 3100 dipakai aplikasi lain di mesin ini → web memakai **3400**.

## 5. Cara menjalankan
Lihat README. Ringkasnya, jalankan dalam tiga terminal:
```bash
pnpm db:dev                     # 1. PostgreSQL dev
pnpm api:build && pnpm api:start   # 2. API → http://localhost:4100
pnpm web:build && pnpm web:start   # 3. Web → http://localhost:3400
```
Tanpa Google Client ID, gunakan form **"Mode pengembangan"** di `/masuk` (aktif karena `ENABLE_DEV_LOGIN=true` di `apps/api/.env` lokal).

## 6. Kekurangan & kebutuhan konfigurasi
| # | Hal | Dampak / tindakan |
|---|---|---|
| 1 | **Google OAuth Client ID** belum ada | Isi `GOOGLE_CLIENT_IDS=<web-client-id>` di `apps/api/.env`, lalu daftarkan origin `http://localhost:3400` (dan domain production) sebagai *Authorized JavaScript origins* di Google Cloud Console. Tombol Google muncul otomatis. |
| 2 | Google Form lama belum diverifikasi | Field form masih usulan (`verifiedAgainstOriginalForm: false`). Setelah screenshot diterima, label/wajib/pertanyaan tambahan diubah di setting `booking_form` tanpa perubahan kode. |
| 3 | Foto Hari, nomor WhatsApp, email kontak | Belum ada. Hero menampilkan monogram dan tombol WhatsApp tersembunyi sampai diisi (CMS Fase 3). |
| 4 | Paket & harga | Belum ada, sehingga harga tampil "dikonfirmasi oleh Hari Susanto". Langkah Paket di form muncul otomatis setelah paket dibuat (CMS). |
| 5 | Kebijakan privasi | Disusun dari data yang benar-benar diproses sistem, tetapi **perlu ditinjau pemilik/penasihat hukum** sebelum go-live. |
| 6 | Portfolio, rating Google, feed Instagram | Sementara berupa tautan ke sumber asli. Integrasi API resmi ada di Fase 5. |
| 7 | Push notification (FCM) | Notifikasi baru in-app. Email/push ada di fase Android/Business. |
| 8 | Label jawaban pertanyaan tambahan di halaman detail | Ditampilkan dengan key-nya; perlu dipetakan ke label saat pertanyaan tambahan mulai dipakai. |
| 9 | `X-Forwarded-For` di proxy web | Di production, web **wajib** berada di belakang reverse proxy (nginx/LB) yang menulis `X-Forwarded-For`, dengan `TRUST_PROXY=1` di API. Dicatat untuk Fase 7. |
| 10 | Admin yang login di web customer | Hanya mendapat pesan "gunakan CMS". Panel admin ada di Fase 3. |
