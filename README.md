# Hari MC Booking

Platform pemesanan jasa MC milik **Hari Susanto** (Jasa MC Ultah Kak Hari, Gambir, Jakarta Pusat). Platform ini menggantikan proses pemesanan lewat WhatsApp dan Google Form.

| App | Teknologi | Status |
|---|---|---|
| `apps/api` | NestJS 11, Prisma 6, PostgreSQL 17 | Fase 1–3 selesai |
| `apps/web` | Next.js 15 (website pelanggan + CMS `/admin`), Tailwind 4, FullCalendar 6 | Fase 2–3 selesai |
| `apps/android` | Kotlin, Jetpack Compose, Material 3 | Fase 4 |

Dokumentasi: [Progress](PROGRESS.md) · [Arsitektur](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [Roadmap](docs/ROADMAP.md) · [Laporan Fase 1](docs/PHASE-1-REPORT.md) · [Laporan Fase 2](docs/PHASE-2-REPORT.md) · [Laporan Fase 3](docs/PHASE-3-REPORT.md) · [API](docs/API.md)

## Prasyarat
- Node.js ≥ 20.11 (diuji dengan 24.4) dan pnpm 10
- PostgreSQL 17. Tidak perlu diinstal untuk development: `pnpm db:dev` menjalankan PostgreSQL embedded. Alternatifnya, pakai Docker (`infrastructure/docker/docker-compose.yml`) atau server PostgreSQL sendiri.

## Menjalankan secara lokal

```bash
pnpm install

# 1. Konfigurasi (sekali)
cp apps/api/.env.example apps/api/.env       # isi password DATABASE_URL + JWT_ACCESS_SECRET
cp apps/web/.env.example apps/web/.env.local # API_INTERNAL_URL=http://127.0.0.1:4100
#    Development tanpa Google Client ID: set ENABLE_DEV_LOGIN=true dan TRUST_PROXY=1 di apps/api/.env

# 2. Database (terminal 1, biarkan berjalan)
pnpm db:dev

# 3. Migration + seed (sekali / setelah ada migration baru)
pnpm --filter @hmc/api db:deploy
pnpm --filter @hmc/api db:seed

# 4. API (terminal 2)
pnpm api:build && pnpm api:start         # http://localhost:4100/api/v1  ·  Swagger: /api/docs

# 5. Website (terminal 3)
pnpm web:build && pnpm web:start         # http://localhost:3400
#    atau mode pengembangan dengan hot reload: pnpm web:dev
```

### Login
- **Google**: isi `GOOGLE_CLIENT_IDS=<Web Client ID>` di `apps/api/.env`, lalu daftarkan `http://localhost:3400` sebagai *Authorized JavaScript origin* di Google Cloud Console. Tombol Google muncul otomatis di `/masuk`.
- **Email (kode 6 digit, tanpa password)** untuk pelanggan: masuk dan daftar jadi satu alur di `/masuk`. Isi `EMAIL_TRANSPORT=smtp` + `SMTP_*` + `EMAIL_FROM` di `apps/api/.env` untuk mengirim email sungguhan. Di development tanpa SMTP (`EMAIL_TRANSPORT=log`), kode dicetak di konsol API dan disimpan di `apps/api/storage/dev-mailbox/`. Admin tidak bisa masuk lewat email (wajib Google).
- **Login uji** (`ENABLE_DEV_LOGIN=true`): hanya endpoint API untuk test otomatis; tidak tampil di halaman pelanggan. API **menolak start** jika aktif bersama `NODE_ENV=production`.
- **Admin (Hari)**: jalankan di server `pnpm --filter @hmc/api admin:provision --email <email-google-hari>` (atau isi `ADMIN_EMAIL`). Tidak ada registrasi admin, dan hanya ada satu admin aktif. Ganti admin dengan `--replace`.
- **CMS**: buka `http://localhost:3400/admin`. Sebelum Google Client ID tersedia, uji lokal dengan `ENABLE_DEV_ADMIN_LOGIN=true` (perlu `ENABLE_DEV_LOGIN=true`; hanya untuk admin yang sudah diprovisioning; ditolak di production).

## Test

```bash
pnpm api:test        # unit API
pnpm api:test:e2e    # integration API — PostgreSQL terisolasi (port 54339)
pnpm web:test        # unit web (vitest)
pnpm web:test:e2e    # E2E browser full-stack, 3 viewport — stack terisolasi (PG 54349, API 4199, web 3499)
pnpm test:all        # semuanya
```
Tidak ada test yang menyentuh database dev.

## Port
| Layanan | Port |
|---|---|
| Web | 3400 (3000/3100 dipakai aplikasi lain di mesin dev) |
| API | 4100 |
| PostgreSQL dev / test / e2e | 54329 / 54339 / 54349 |
