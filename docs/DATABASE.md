# Database Design

Sumber kebenaran: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) + migration SQL di `apps/api/prisma/migrations/`.

## Tabel

| Tabel | Isi | Catatan |
|---|---|---|
| `users` | Identitas (Google sub, email, nama, foto, role, status) | Email wajib lowercase (CHECK). Soft delete `deleted_at`. **Maks. 1 admin aktif** (partial unique index). |
| `customer_profiles` | WhatsApp (E.164), kota, catatan admin | 1:1 dengan users |
| `admin_profiles` | Nama tampilan admin | 1:1 dengan users |
| `refresh_tokens` | Hash SHA-256 refresh token, family (sesi), rotasi (`used_at`, `replaced_by_id`), pencabutan | Token mentah tidak pernah disimpan |
| `mc_profile` | Profil Hari Susanto | Singleton (unique + CHECK) |
| `services` | Kategori acara (7 kategori seed) | Soft delete |
| `service_packages` | Paket, durasi, harga, fasilitas | **Tidak di-seed.** Harga diisi lewat CMS. CHECK harga ≥ 0, durasi > 0 |
| `bookings` | Booking + snapshot kontak & harga + jawaban form tambahan | Unique `(customer_id, idempotency_key)`. CHECK jam & nominal. **Exclusion constraint anti double-booking** |
| `event_details` | Detail acara & kebutuhan MC | 1:1 dengan bookings |
| `booking_status_logs` | Riwayat transisi status (dari, ke, aksi, aktor, catatan) | |
| `booking_attachments` | File lampiran booking | |
| `payments` | Pencatatan DP / pelunasan / refund, status verifikasi | CHECK amount > 0. Unique `(gateway_provider, gateway_reference)` untuk gateway kelak. Booking dengan payment tidak bisa dihapus (RESTRICT) |
| `payment_proofs` | Bukti pembayaran | |
| `portfolios` | Foto/video portfolio | Urutan, aktif/nonaktif, soft delete |
| `external_reviews` | Cache berumur pendek review Google Places | `expires_at` wajib. Tidak pernah diisi manual |
| `notifications` | Notifikasi in-app + status push FCM | `dedupe_key` unik untuk mencegah notifikasi ganda |
| `device_tokens` | Token FCM per perangkat | |
| `business_settings` | Key-value: `booking_form`, `booking_rules`, `payment_info`, `google_reviews`, `instagram` | |
| `audit_logs` | Semua aksi admin + event keamanan | |

Semua primary key memakai UUID. Semua timestamp memakai `timestamptz(3)` dan disimpan dalam UTC. Uang memakai `numeric(14,2)`.

## Constraint SQL tambahan (migration `init`)

```sql
-- anti double-booking: hanya status yang memblokir jadwal
EXCLUDE USING gist (tstzrange(event_start_at, event_end_at, '[)') WITH &&)
  WHERE (status IN ('ACCEPTED','WAITING_PAYMENT','CONFIRMED','IN_PROGRESS') AND deleted_at IS NULL)

-- satu admin aktif
CREATE UNIQUE INDEX users_single_active_admin ON users (role) WHERE role = 'ADMIN' AND deleted_at IS NULL;
```

Constraint di atas tidak terlihat oleh Prisma, tetapi sudah diverifikasi bahwa `prisma migrate dev` **tidak** mendeteksi drift dan tidak akan menghapusnya.

## Seed (`pnpm db:seed`, idempoten)
Seed hanya berisi data yang diberikan pemilik: profil Hari, 7 kategori layanan, dan settings awal. Re-run tidak menimpa perubahan dari CMS.
Seed **tidak** membuat paket/harga, rating, review, testimoni, pelanggan, atau booking contoh.
