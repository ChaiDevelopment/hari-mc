# Phase 1 — Foundation: Laporan

Tanggal: 17 November 2026

## Audit environment
| Item | Temuan | Tindakan |
|---|---|---|
| Direktori `d:\hari` | Kosong | Monorepo dibuat dari nol, tidak ada file yang ditimpa |
| Node / pnpm / JDK / Gradle / Android SDK | 24.4 / 10.34 / 17 / 9.1 / platform 35 + build-tools 35 | Cukup untuk semua fase |
| Docker, PostgreSQL, WSL distro | **Tidak ada** | Dev memakai `embedded-postgres` (binary resmi PG 17), compose disiapkan untuk mesin dengan Docker |
| Disk C: | 8 GB kosong | pnpm store dipindah ke `D:/.pnpm-store` |
| Port 4000 | Dipakai aplikasi lain | API memakai **4100** |
| Proses PostgreSQL lain (`D:\mam`, `D:\midman`) | Berjalan | Tidak disentuh |
| Versi npm "latest" | Prisma 8 masih RC, NestJS 12 | Di-pin ke versi stabil: NestJS 11, Prisma 6.19.3 |

## Yang dibangun
- **Monorepo** pnpm (`apps/*`, `packages/*`).
- **Skema database lengkap** untuk semua fase: 18 tabel, 1 migration. Termasuk exclusion constraint anti double-booking, single-admin index, dan CHECK constraints (lihat `DATABASE.md`).
- **Seed** profil Hari, 7 kategori, dan 5 settings. Tidak ada harga, rating, atau review buatan. Form booking ditandai `verifiedAgainstOriginalForm: false`.
- **NestJS core**:
  - Konfigurasi divalidasi dengan zod, termasuk aturan khusus production.
  - Helmet, CORS allowlist, rate limiting, dan ValidationPipe (whitelist + forbidNonWhitelisted).
  - Filter error Prisma dan Swagger (`/api/docs`).
  - Endpoint health dan `trust proxy` yang configurable.
- **Auth**:
  - Verifikasi Google ID token di backend dan auto-registrasi customer.
  - JWT access token 15 menit.
  - Refresh token opaque dengan hash + rotasi + deteksi reuse (mencabut seluruh family).
  - Cookie httpOnly + header CSRF untuk web; token di body untuk Android.
  - Logout dan `/auth/me`.
- **RBAC**: AuthGuard global (deny-by-default, reload user + sesi dari DB setiap request) dan RolesGuard.
- **Admin provisioning CLI** (`admin:provision`): tanpa password dan tanpa endpoint publik, plus opsi `--replace`.
- **Audit**: login, registrasi, logout, reuse token, perubahan profil, dan provisioning admin. Endpoint admin `GET /admin/audit-logs`.
- **Endpoint publik**: `GET /mc-profile`, `GET /services`, `GET /health`.
- **Endpoint customer**: `GET/PATCH /me/profile` (normalisasi WhatsApp ke +62).

## Hasil test

| Suite | Hasil |
|---|---|
| Unit (env validation, normalisasi WhatsApp, RolesGuard) | **12/12 lulus** |
| E2E Auth (registrasi pertama, login ulang, token invalid, email unverified, konflik akun, cookie httpOnly, CSRF, rotasi + reuse detection, refresh paralel, logout, suspend, rate limit) | **10/10 lulus** |
| E2E RBAC (**semua** route `/admin/*` ditemukan otomatis dari OpenAPI → 401 anonim / 403 customer, provisioning admin, login admin, single admin di CLI + DB, `--replace`, promosi memaksa login ulang, validasi profil, mass-assignment ditolak, endpoint publik) | **9/9 lulus** |
| E2E Database (double booking ditolak, PENDING boleh overlap, slot berurutan, PENDING→ACCEPTED bentrok ditolak, cancel membebaskan slot, **10 accept paralel → tepat 1 sukses**, idempotency key, FK, CHECK jam/nominal/email/payment, singleton, RESTRICT, rollback transaksi, seed jujur) | **16/16 lulus** |

Smoke test terhadap server build production (`node dist/main.js`):
- Health OK, profil Hari, dan 7 kategori tampil.
- Anonymous ke `/admin` → 401. JWT `alg=none` → 401.
- `role` di body → 400. Origin asing tidak mendapat header CORS.
- Swagger 200. Header helmet (CSP, HSTS, nosniff) aktif.

## Masalah yang ditemukan & diperbaiki selama fase ini
1. `initdb` di Windows memakai encoding WIN1252 → data dev diinisialisasi ulang dengan **UTF-8** (`--encoding=UTF8`). Ini penting untuk nama dan teks berbahasa Indonesia.
2. `incremental` + `deleteOutDir` menghasilkan `dist` kosong sebagian → `incremental` dimatikan.
3. `trust proxy` yang di-hardcode memungkinkan pemalsuan `X-Forwarded-For` untuk mengakali rate limit → sekarang env `TRUST_PROXY` (default 0).
4. Helper test `TRUNCATE … CASCADE` ikut menghapus `business_settings` → diganti `DELETE` berurutan.

## Asumsi yang dibuat (bisa diubah)
- `travelBufferMinutes: 60`, `minLeadTimeHours: 24`, dan `maxAdvanceDays: 365` di `booking_rules` adalah asumsi teknis, bukan kebijakan Hari.
- Booking PENDING tidak memblokir slot. Slot baru terkunci saat booking diterima (ACCEPTED).
- Sesi admin 7 hari dan sesi customer 30 hari.
- Refresh paralel dengan token yang sama dianggap reuse (strict). Klien web harus melakukan refresh secara single-flight (diimplementasikan di Phase 2).

## Belum dikerjakan di fase ini
Booking API, notifikasi FCM, payments, upload/storage, integrasi Google Reviews/Instagram, serta web dan Android → fase 2–5 sesuai `ROADMAP.md`.
