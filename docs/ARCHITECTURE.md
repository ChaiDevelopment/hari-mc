# Hari MC Booking — Final Architecture

Platform **single-MC** untuk Hari Susanto ("Jasa MC Ultah Kak Hari", Gambir, Jakarta Pusat).
Tidak ada marketplace, pencarian MC, atau registrasi talent.

## 1. Topologi

```
                ┌──────────────────────────┐
  Browser ─────▶│ apps/web  (Next.js 15)   │  /           landing, booking, dashboard customer
                │  - customer routes       │  /admin/*    CMS Hari (route group terpisah)
                └───────────┬──────────────┘
                            │ HTTPS  REST /api/v1  (Bearer access token + httpOnly refresh cookie)
  Android ──────────────────┤ (Bearer access token + refresh token di EncryptedSharedPreferences)
  (Kotlin/Compose)          ▼
                ┌──────────────────────────┐      ┌───────────────────┐
                │ apps/api  (NestJS 11)    │─────▶│ PostgreSQL 17     │  satu database
                │  Prisma 6, Swagger       │      └───────────────────┘
                │  RBAC, rate limit, audit │─────▶ Firebase Cloud Messaging (firebase-admin, server only)
                │                          │─────▶ Google ID token verification (google-auth-library)
                │                          │─────▶ Object storage (S3-compatible / local disk di dev)
                │                          │─────▶ Google Places API (New) — opsional, via adapter
                │                          │─────▶ Meta Graph API (Instagram) — opsional, via adapter
                └──────────────────────────┘
```

Keputusan:

| Topik | Keputusan | Alasan |
|---|---|---|
| Web + CMS | **Satu Next.js app** (`apps/web`) dengan route `/admin/*` | Prompt mengizinkan; satu design system, satu build. Keamanan admin ditegakkan di **API**, bukan di frontend. |
| Backend | NestJS 11 + Prisma 6.19 (pinned) | Versi stabil yang terverifikasi. Prisma 8 masih RC per Nov 2026. |
| Database dev | `embedded-postgres` (PostgreSQL 17 binary resmi via npm) | Mesin dev tidak punya Docker/PostgreSQL/WSL. Production memakai PostgreSQL 17 biasa (Docker / managed). |
| Shared types | API mengembalikan `allowedTransitions` per booking | Satu sumber kebenaran (backend) untuk web dan Android, tanpa menduplikasi rules di Kotlin. |
| Android | Native Kotlin + Compose + Material 3, Credential Manager (Sign in with Google), Retrofit/OkHttp, FCM | Sesuai spesifikasi. Tidak ada service account di APK. |

### Catatan implementasi Fase 2
- **Proxy same-origin**: browser hanya memanggil `https://<web>/api/v1/*`. Route handler Next.js (`apps/web/src/app/api/v1/[...path]/route.ts`) meneruskan request ke `API_INTERNAL_URL`, sehingga cookie refresh token menjadi first-party dan alamat API dibaca saat runtime. Proxy tidak menambah hak akses; semua otorisasi tetap di API. Di production, web wajib berada di belakang reverse proxy yang menulis `X-Forwarded-For`, dengan `TRUST_PROXY=1` di API.
- **Refresh token di web**: refresh dilakukan single-flight dalam tab dan diserialisasi lintas tab dengan Web Locks (`navigator.locks`). Tanpa ini, dua tab yang refresh bersamaan akan memicu deteksi reuse dan mencabut sesi.
- **Dev login** (`POST /auth/dev-login`): hanya jika `ENABLE_DEV_LOGIN=true` dan `NODE_ENV≠production`. Validasi env menolak start jika aktif di production. Endpoint 404 sebelum validasi body jika nonaktif, hanya membuat/memakai akun CUSTOMER tanpa `google_sub`, dan tidak pernah bisa masuk sebagai admin atau akun Google.
- **Zona waktu**: input jadwal dibatasi ke WIB/WITA/WIT (tanpa DST) agar konversi ke UTC selalu tepat.
- **Cek slot saat submit**: booking baru ditolak (409 `SLOT_UNAVAILABLE`) jika bentrok dengan booking yang sudah mengunci jadwal plus `travelBufferMinutes`, tanpa membocorkan data booking lain. PENDING tetap tidak mengunci slot.

## 2. Autentikasi & Sesi

**Customer dan Admin sama-sama login lewat Google (passwordless).** Tidak ada password admin sama sekali.

1. Client mendapatkan **Google ID token** (web: Google Identity Services; Android: Credential Manager `GetGoogleIdOption` dengan `serverClientId` = Web Client ID).
2. `POST /api/v1/auth/google { idToken, client }` → API memverifikasi signature, `aud` (daftar `GOOGLE_CLIENT_IDS`), `iss`, `exp`, dan `email_verified` dengan `google-auth-library`. Data identitas dari frontend tidak dipercaya.
3. User dicari berdasarkan `google_sub`. Login pertama → buat `users` (role `CUSTOMER`) + `customer_profiles` dalam satu transaksi.
4. API menerbitkan:
   - **Access token**: JWT HS256, 15 menit, klaim `sub`, `role`, `sid`.
   - **Refresh token**: 48 byte acak (opaque). Hanya **hash SHA-256** yang disimpan di tabel `refresh_tokens`. Token dikelompokkan dalam satu `family`.
5. **Rotasi refresh token**: setiap refresh menghasilkan token baru dan menandai token lama sebagai terpakai (update bersyarat agar aman dari race). Jika token lama dipakai lagi, itu terdeteksi sebagai **reuse** → seluruh family dicabut, dicatat di audit log, dan klien harus login ulang.
6. **Web**: refresh token dikirim sebagai cookie `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`. Endpoint yang memakai cookie mewajibkan header `X-HMC-CSRF: 1` (custom header + CORS allowlist sebagai CSRF defense). Access token hanya disimpan di memori.
   **Android**: refresh token dikirim di body dan disimpan dengan Android Keystore (EncryptedSharedPreferences / Tink).
7. **Admin provisioning (aman, tanpa registrasi publik)**:
   `pnpm --filter @hmc/api admin:provision --email <gmail Hari>` dijalankan oleh operator di server. Perintah ini membuat user ber-role `ADMIN` + `admin_profiles`. Saat Hari login Google pertama kali dengan email terverifikasi tersebut, `google_sub` diikat ke akun admin.
   Database menegakkan **maksimal satu admin aktif** melalui partial unique index.
8. Setiap request terautentikasi memuat ulang user dari DB, sehingga user yang di-suspend atau dihapus langsung kehilangan akses.
9. Masa sesi: customer 30 hari, admin 7 hari (refresh TTL, bisa dikonfigurasi lewat env).

## 3. Otorisasi

- `AuthGuard` global: semua endpoint wajib login kecuali yang diberi `@Public()`.
- `RolesGuard` global: endpoint admin diberi `@Roles('ADMIN')`. Semua controller admin berada di prefix `/api/v1/admin/*` dan diberi guard di level class.
- **Data ownership**: query customer selalu difilter `customerId = currentUser.id` di layer service, bukan di frontend.
- Ada test otomatis yang memastikan setiap route `/admin/*` mengembalikan 401/403 untuk anonymous dan customer.

## 4. Booking Engine

### Status & transisi (ditegakkan backend)

| Dari | Ke | Aktor |
|---|---|---|
| PENDING | ACCEPTED, REJECTED | ADMIN |
| PENDING | CANCELLED | CUSTOMER, ADMIN |
| ACCEPTED | WAITING_PAYMENT | ADMIN, SYSTEM |
| ACCEPTED | CANCELLED | CUSTOMER, ADMIN |
| WAITING_PAYMENT | CONFIRMED | ADMIN (setelah DP terverifikasi) |
| WAITING_PAYMENT | CANCELLED | CUSTOMER, ADMIN |
| CONFIRMED | IN_PROGRESS | ADMIN |
| CONFIRMED | CANCELLED | ADMIN (customer mengajukan *cancellation request* → notifikasi admin) |
| IN_PROGRESS | COMPLETED | ADMIN |
| CANCELLED | REFUNDED | ADMIN (hanya jika ada pembayaran VERIFIED) |

REJECTED, COMPLETED, dan REFUNDED adalah status final. "Request changes" bukan status: aksi ini mencatat log + catatan dan mengirim notifikasi ke customer, sementara status tetap PENDING.

Setiap transisi berjalan dalam satu transaksi DB:
1. `SELECT … FOR UPDATE` pada booking.
2. Validasi rule.
3. Update status + timestamp.
4. Insert `booking_status_logs` (dari, ke, aktor, catatan).
5. Insert `audit_logs`.
6. Insert `notifications` dengan `dedupe_key` unik.

Push FCM dikirim **setelah commit** dan idempoten per notifikasi.

### Pencegahan double booking (dua lapis)
1. **Aplikasi**: saat transisi ke status yang memblokir jadwal (ACCEPTED, WAITING_PAYMENT, CONFIRMED, IN_PROGRESS), cek overlap `[start - buffer, end + buffer)` di dalam transaksi `SERIALIZABLE`.
2. **Database**: `EXCLUDE USING gist (tstzrange(event_start_at, event_end_at) WITH &&) WHERE (status IN blocking AND deleted_at IS NULL)`. Dua booking aktif yang bentrok tidak mungkin tersimpan walaupun ada race.

Booking PENDING **tidak** memblokir slot. Banyak calon pelanggan boleh mengajukan slot yang sama, lalu Hari yang memilih.

### Idempotensi submit
Client membuat `Idempotency-Key` (UUID) per sesi form. Unique `(customer_id, idempotency_key)` memastikan klik berkali-kali mengembalikan booking yang sama.

### Snapshot harga
Nama paket, harga, durasi, biaya transport, biaya tambahan, total, dan DP disalin ke baris booking saat submit. Perubahan harga paket di kemudian hari tidak mengubah booking lama.

## 5. Form booking yang configurable
Field inti (nama, email, WA, tanggal, jam, lokasi, dll.) disimpan sebagai kolom. Daftar field, label, wajib/opsional, dan **pertanyaan tambahan** disimpan di `business_settings.booking_form` dan jawabannya di `bookings.form_answers` (JSON tervalidasi terhadap definisi).
Setiap field memiliki flag `verifiedAgainstOriginalForm: false` karena **Google Form lama belum berhasil dibaca**. Field ini harus diverifikasi setelah pemilik memberikan screenshot atau isi form asli.

## 6. Integrasi eksternal (adapter + fallback jujur)

| Integrasi | Jika kredensial tidak ada |
|---|---|
| Google Places (reviews) | Tampilkan tombol "Lihat ulasan di Google Maps" (link asli). **Tidak ada rating/review buatan.** |
| Instagram Graph API | Tampilkan link profil `@hari.jasamc` + portfolio upload manual dari CMS. |
| FCM | Notifikasi tetap tercatat in-app; push dilewati dan dicatat `push_status = SKIPPED`. |
| Payment gateway (Midtrans/Xendit) | Interface `PaymentGateway` disiapkan, implementasi aktif = `ManualPaymentRecorder`. |
| Storage | `LocalDiskStorage` (dev) / `S3Storage` (prod, S3-compatible: R2, GCS interop, MinIO). |

Catatan kebijakan Google Places: konten Places (termasuk review) tidak boleh di-prefetch atau disimpan permanen. Tabel `external_reviews` diperlakukan sebagai **cache berumur pendek** (`expires_at`) dan wajib ditampilkan beserta atribusi penulis dan logo Google. TTL harus disesuaikan dengan ToS Google Maps Platform yang berlaku saat deploy.

## 7. Keamanan (ringkas)
Helmet, CORS allowlist, rate limiting (global + ketat di `/auth`), `ValidationPipe` (whitelist + forbidNonWhitelisted), Prisma (parameterized, tanpa raw SQL dari input), validasi upload (MIME sniffing + ukuran + ekstensi), secret hanya di env, audit log untuk semua aksi admin dan event keamanan, serta Swagger dimatikan di production kecuali `SWAGGER_ENABLED=true`.
