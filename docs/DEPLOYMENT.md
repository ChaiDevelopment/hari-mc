# Panduan Deploy — Hari MC Booking

Status: **kode sudah siap. Belum ada yang di-deploy.** Deploy dilakukan bersama pemilik setelah akun-akun di bawah tersedia.

## Arsitektur produksi

```
Pengunjung ──▶ Cloudflare (DNS, HTTPS, proteksi)
                 │
                 ├─ Website + CMS ── Cloudflare Workers  (apps/web, OpenNext)
                 │        │  proxy /api/v1/*  (browser hanya bicara ke domain website)
                 │        ▼
                 └─ API NestJS ───── Container (Cloudflare Containers / Railway / Render / Fly / VPS)
                          │                         image: apps/api/Dockerfile
                          ├─▶ PostgreSQL ── Neon / Supabase (backup otomatis)
                          ├─▶ File ──────── Cloudflare R2 (bucket privat)
                          └─▶ Email ─────── SMTP (Gmail app password / Brevo / Resend …)
```

**Mengapa database tidak di Cloudflare D1?** D1 berbasis SQLite. Aturan anti double-booking (exclusion constraint), satu admin (partial unique index), dan penguncian transaksi bergantung pada fitur PostgreSQL.

## Yang perlu disiapkan pemilik
| # | Akun / data | Untuk |
|---|---|---|
| 1 | Akun **Cloudflare** (gratis untuk mulai; *Workers Paid* bila memakai Cloudflare Containers) | Website, R2, (opsional) API |
| 2 | Akun **Neon** atau **Supabase** | Database PostgreSQL |
| 3 | Tempat API: **Cloudflare Containers** atau **Railway/Render/Fly/VPS** | Menjalankan image Docker API |
| 4 | **SMTP** (mis. Gmail + App Password) | Kode masuk via email |
| 5 | Email Google Hari | `admin:provision` |
| 6 | (Opsional) domain sendiri | Alamat profesional; bisa mulai dengan `*.workers.dev` |

## Langkah 1 — Database (Neon / Supabase)

> **Supabase (dipakai proyek ini — sudah disiapkan 18 Nov 2026):**
> - Gunakan **Session pooler** (IPv4), bukan host langsung `db.<ref>.supabase.co` (hanya IPv6):
>   `postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?schema=app&sslmode=require`
>   (Host pooler bisa berbeda per project — salin dari Supabase → **Connect → Session pooler**.)
> - Tabel aplikasi berada di **schema `app`**, bukan `public`. Data API Supabase hanya membuka `public`, jadi tabel aplikasi tidak bisa dibaca lewat REST API Supabase (`anon`/`authenticated` tidak punya akses).
> - Aplikasi **tidak memakai** API key Supabase (`sb_secret_…` / `sb_publishable_…`), hanya koneksi PostgreSQL.
> - Password, user, dan URL koneksi **hanya** diisi di environment hosting API — jangan di repo.

1. Buat project PostgreSQL (versi 16/17), region terdekat (mis. Singapore).
2. Salin **connection string** → dipakai sebagai `DATABASE_URL` API (tambahkan `?sslmode=require` bila belum ada).
3. Migration dijalankan **otomatis** saat container API start (`RUN_MIGRATIONS=true`, default).
4. Isi data awal sekali (dari laptop, dengan `DATABASE_URL` produksi di environment):
   ```bash
   DATABASE_URL="<url-produksi>" pnpm --filter @hmc/api db:seed
   DATABASE_URL="<url-produksi>" pnpm --filter @hmc/api admin:provision --email <email-google-hari>
   ```
5. Aktifkan backup / Point-in-time restore di dashboard penyedia database.

## Langkah 2 — Cloudflare R2
1. Cloudflare → R2 → **Create bucket** (mis. `hari-mc-files`). **Jangan** aktifkan akses publik.
2. R2 → **Manage API Tokens** → buat token *Object Read & Write* khusus bucket tersebut.
3. Isi di environment API:
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_BUCKET=hari-mc-files
   S3_REGION=auto
   S3_ACCESS_KEY_ID=<access key>
   S3_SECRET_ACCESS_KEY=<secret key>
   ```

## Langkah 3 — API (image Docker)
Build dari root repo: `docker build -f apps/api/Dockerfile -t hari-mc-api .`. CI GitHub juga membangun image ini pada setiap push.

**Environment variables API (produksi):**
| Variabel | Nilai |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4100` (atau sesuai platform) |
| `DATABASE_URL` | dari Langkah 1 |
| `JWT_ACCESS_SECRET` | acak ≥ 32 karakter: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GOOGLE_CLIENT_IDS` | Web Client ID Google |
| `CORS_ORIGINS` | URL website, mis. `https://hari-mc-web.<akun>.workers.dev` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | jumlah proxy di depan API — biasanya `2` (Worker website + proxy platform). Lihat catatan di bawah. |
| `STORAGE_DRIVER`, `S3_*` | dari Langkah 2 |
| `EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | layanan email |
| `SWAGGER_ENABLED` | `false` (default produksi) |
| `ENABLE_DEV_LOGIN`, `ENABLE_DEV_ADMIN_LOGIN` | **jangan diisi** — API menolak start jika aktif di produksi |

**Pilihan tempat API:**
- **Railway / Render / Fly.io**: buat service dari repo GitHub → Dockerfile path `apps/api/Dockerfile`, build context root → isi env → deploy. Platform memberi URL publik `https://…` untuk `API_INTERNAL_URL`.
- **Cloudflare Containers** (paket Workers Paid): jalankan image yang sama sebagai container di belakang Worker. Konfigurasi container dibuat saat akun tersedia.
- **VPS**: `docker run -d --restart=always -p 4100:4100 --env-file .env.production hari-mc-api` di belakang Caddy/nginx (HTTPS).

Cek: `GET https://<api>/api/v1/health` → `{"status":"ok","database":"up"}`.

## Langkah 4 — Website + CMS (Cloudflare Workers)
1. Ubah `vars.API_INTERNAL_URL` di `apps/web/wrangler.jsonc` ke URL API dari Langkah 3 (atau atur di dashboard Worker → Settings → Variables).
2. Pilih salah satu:
   - **GitHub Actions (disarankan)**: GitHub repo → Settings → Secrets → tambah `CLOUDFLARE_API_TOKEN` (izin *Workers Scripts: Edit*) dan `CLOUDFLARE_ACCOUNT_ID` → Actions → **Deploy Web (Cloudflare Workers)** → *Run workflow*. Deploy hanya terjadi saat dijalankan manual.
   - **Workers Builds (dashboard Cloudflare)**: Workers → Create → Import repository `ChaiDevelopment/hari-mc` → Root directory `apps/web` → Build command `pnpm install --frozen-lockfile && pnpm cf:build` → Deploy command `pnpm exec opennextjs-cloudflare deploy`.
   - **Dari komputer Linux/WSL**: `pnpm --filter @hmc/web cf:deploy` (build OpenNext gagal di Windows tanpa Developer Mode karena butuh symlink).
3. Hasil: `https://hari-mc-web.<akun>.workers.dev`.

## Langkah 5 — Google & pengecekan akhir
1. Google Cloud → Clients → Web client → **Authorized JavaScript origins** → tambah URL website produksi.
2. Google Auth Platform → Audience → **Publish app** (keluar dari mode *Testing*) agar semua orang bisa login Google.
3. Uji: buka website → login Google & email → buat pesanan → login admin `/admin` → terima → biaya → pembayaran → kalender.
4. Isi data bisnis di CMS: foto, WhatsApp, paket/harga, rekening, aturan jadwal.

## Catatan teknis
- **TRUST_PROXY**: IP pengunjung yang asli diambil dari `CF-Connecting-IP` di Worker, lalu dikirim sebagai `X-Forwarded-For` ke API. Platform hosting API biasanya menambah satu proxy lagi, jadi `TRUST_PROXY=2`. Nilai yang salah membuat rate limit memakai IP yang keliru.
- **Cookie sesi** bersifat first-party di domain website, karena browser hanya berbicara ke Worker yang mem-proxy `/api/v1`.
- **Backup**: database → fitur backup/PITR penyedia; R2 → versioning/replikasi bucket bila diperlukan.
- **Rollback**: Workers → *Deployments* → rollback versi; API → redeploy image sebelumnya. Migration bersifat maju (forward-only) — lakukan backup sebelum migration besar.
