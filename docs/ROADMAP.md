# Implementation Roadmap

Setiap fase: implementasi → jalankan → test → perbaiki → dokumentasi → lanjut.

| Fase | Isi | Status |
|---|---|---|
| **1. Foundation** | Monorepo, PostgreSQL (embedded dev), Prisma schema lengkap + migration (termasuk exclusion constraint anti double-booking + single-admin index), seed profil Hari, NestJS core (config tervalidasi, helmet, CORS, throttler, Swagger, health), Auth (Google ID token verify, JWT, refresh rotation + reuse detection, logout, `/me`), RBAC guards, admin provisioning CLI, Audit service, MC profile publik | **Selesai — lihat `PHASE-1-REPORT.md`** |
| 2. Customer Web | Next.js app, design system (navy / warm white / champagne gold), landing page, Google login (GIS), dashboard, booking form configurable + preview + idempotent submit, order tracking, notification center | **Selesai — lihat `PHASE-2-REPORT.md`** |
| 3. Admin CMS | `/admin` layout + sidebar, dashboard statistik (data nyata), booking management + filter/search/pagination, booking detail + aksi status, FullCalendar, customer management | **Selesai — lihat `PHASE-3-REPORT.md`** |
| 4. Android | Compose/M3 project, Credential Manager login, home, booking form, my bookings, notification center, FCM, secure token storage | Berikutnya (menunggu persetujuan laporan Fase 3) |
| 5. Business | Payments + bukti bayar, packages CRUD, portfolio + storage, Google Reviews adapter, Instagram adapter, reports + CSV | |
| 6. QA | Unit/integration/API/E2E (Playwright 1440/768/390), Android instrumented tests, security tests | |
| 7. Deployment | Dockerfile api/web, docker-compose prod, migrations, env guide, backup & recovery | |

## Informasi yang dibutuhkan dari pemilik (blocking untuk fitur tertentu)
1. **Email Google milik Hari Susanto** → untuk `admin:provision`.
2. **Google OAuth Client ID** (Web + Android SHA-1) → login di web dan Android.
3. **Isi atau screenshot Google Form lama** → verifikasi field form booking.
4. **Daftar paket & harga, kebijakan DP, biaya transport** → diinput sendiri oleh Hari lewat CMS (tidak di-hardcode).
5. **Foto profesional Hari & materi portfolio**.
6. Firebase project (FCM), Google Places API key + Place ID, akses Instagram Graph API (akun Business/Creator).
7. Nomor WhatsApp bisnis resmi.
