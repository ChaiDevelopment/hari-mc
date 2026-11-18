# API Reference (ringkas)

Dokumentasi interaktif lengkap (skema request/response) tersedia di **Swagger**: `http://localhost:4100/api/docs` (JSON: `/api/docs-json`).
Semua endpoint berprefix `/api/v1`. Default: **wajib login**. Endpoint `/admin/*` **wajib role ADMIN**. Role diperiksa di server dari database pada setiap request.

## Publik
| Method | Path | Fungsi |
|---|---|---|
| GET | `/health` | Status server & DB |
| GET | `/site` | Data landing: profil, layanan+paket aktif, FAQ, tautan ulasan/Instagram, portfolio aktif |
| GET | `/booking-form` | Konfigurasi form booking, kategori, paket, zona waktu, aturan jadwal |
| GET | `/mc-profile`, `/services` | Profil MC, kategori + paket aktif |
| GET | `/media/:key` | File gambar publik (foto profil/portfolio) |

## Auth
| Method | Path | Fungsi |
|---|---|---|
| GET | `/auth/config` | `googleClientId`, `devLoginEnabled`, `devAdminLoginEnabled` |
| POST | `/auth/google` | Login Google (ID token diverifikasi server) |
| POST | `/auth/email/request` | `{ email }` → kirim kode 6 digit (berlaku 10 menit). Respons selalu sama (tidak membocorkan apakah email terdaftar). 429 bila < 60 dtk sejak kode terakhir atau > 5 kode/jam |
| POST | `/auth/email/verify` | `{ email, code, client }` → sesi login; akun CUSTOMER dibuat bila baru (`isNewUser`). Maks. 5 percobaan per kode. Akun admin ditolak (wajib Google) |
| POST | `/auth/dev-login` | **Hanya dev** (`ENABLE_DEV_LOGIN`); 404 jika nonaktif |
| POST | `/auth/refresh` | Rotasi refresh token (cookie + header `x-hmc-csrf: 1`, atau body untuk Android) |
| POST | `/auth/logout` | Cabut sesi |
| GET | `/auth/me` | User saat ini |

## Customer
| Method | Path | Fungsi |
|---|---|---|
| GET/PATCH | `/me/profile` | Profil (WA, kota) |
| POST | `/bookings` | Kirim pesanan (header `Idempotency-Key` UUID wajib) |
| GET | `/bookings?scope=upcoming\|past\|all&status=&page=&pageSize=` | Riwayat milik sendiri |
| GET | `/bookings/summary` | Ringkasan dashboard |
| GET | `/bookings/:id` | Detail + timeline (+ `paymentInstructions` saat WAITING_PAYMENT) |
| POST | `/bookings/:id/cancel` | Batalkan (PENDING/ACCEPTED/WAITING_PAYMENT) |
| GET | `/notifications`; POST `/notifications/:id/read`, `/notifications/read-all` | Notifikasi milik sendiri (juga dipakai admin) |
| POST | `/bookings/:id/payments` | Kirim bukti bayar (multipart: `file` JPG/PNG/WEBP/PDF ≤ 5 MB, `amount`, `method` BANK_TRANSFER/E_WALLET/QRIS/OTHER, `paidAt`, `notes?`). Hanya saat ada tagihan; satu bukti menunggu verifikasi pada satu waktu |
| GET | `/bookings/:id/payments/:paymentId/proof` | Lihat bukti sendiri (privat, `no-store`) |

Detail pesanan juga berisi `reviewInvite: { url, direct }` **hanya** bila status COMPLETED (ajakan ulasan Google untuk semua pesanan yang selesai).
Detail pesanan (`GET /bookings/:id`) kini juga berisi `paymentSummary` (total, DP, terverifikasi, menunggu, sisa, `dueNow`, `canSubmitPayment`), `payments`, dan `paymentInstructions` (rekening dari CMS atau kontak Hari).

## Admin (Phase 3)
| Method | Path | Fungsi |
|---|---|---|
| GET | `/admin/dashboard` | Statistik per status, acara mendatang, booking terbaru, agenda 14 hari, notifikasi, jumlah PENDING yang bentrok |
| GET | `/admin/bookings?q=&status=A,B&serviceId=&dateFrom=&dateTo=&sort=&page=&pageSize=` | Daftar + `statusCounts` |
| GET | `/admin/bookings/:id` | Detail lengkap + `allowedTransitions` + `conflicts` + pembayaran + lampiran |
| POST | `/admin/bookings/:id/transition` | `{ toStatus, expectedStatus?, note? }`. Alasan wajib untuk REJECTED/CANCELLED |
| POST | `/admin/bookings/:id/request-changes` | `{ message }`. Status tetap; tercatat + notifikasi |
| PATCH | `/admin/bookings/:id/pricing` | `{ packagePrice, transportFee, additionalFee, additionalFeeNote?, discountAmount, depositAmount }` (rupiah bulat). Total dihitung server |
| GET | `/admin/calendar?from=ISO&to=ISO&status=` | Event + `blocking` + `conflicts` (maks. 100 hari) |
| GET | `/admin/customers?q=&page=`, `/admin/customers/:id` | Pelanggan + riwayat + total pembayaran terverifikasi |
| GET | `/admin/settings` | Semua pengaturan |
| PATCH | `/admin/settings/profile` | Profil Hari & bisnis |
| PUT | `/admin/settings/booking-rules` | Jeda perjalanan, minimal waktu pesan, batas hari |
| PUT | `/admin/settings/payment` | Kebijakan DP (`UNSET`/`PERCENT`/`FIXED`), rekening, instruksi |
| PUT | `/admin/settings/transport` | Kebijakan transport (`UNSET`/`FLAT`/`PER_BOOKING`) |
| PUT | `/admin/settings/google-reviews` | `{ placeId }` untuk tautan "Tulis ulasan" (kosong = tautan Google Maps) |
| GET/POST/PATCH | `/admin/services[/:id]` | Kategori layanan (nonaktifkan, bukan hapus) |
| GET/POST/PATCH/DELETE | `/admin/packages[/:id]` | Paket & harga (DELETE = arsip; snapshot booking lama tetap) |
| GET/POST/PATCH/DELETE | `/admin/portfolio[/:id]`, POST `/admin/portfolio/reorder` | Portfolio (DELETE = soft delete) |
| POST | `/admin/payments/:id/verify` | Verifikasi pembayaran. Jika total terverifikasi ≥ DP (atau total bila DP 0) dan status WAITING_PAYMENT → **otomatis CONFIRMED** |
| POST | `/admin/payments/:id/reject` | `{ reason }`. Pelanggan dapat mengirim ulang |
| POST | `/admin/bookings/:id/payments` | Catat pembayaran yang diterima langsung (mis. tunai). Langsung terverifikasi |
| GET | `/admin/payments/:id/proof` | Lihat bukti pembayaran |
| POST | `/admin/media` | Upload gambar (multipart `file`; JPG/PNG/WEBP dideteksi dari isi file; maks. 5 MB) |
| GET | `/admin/audit-logs` | Audit log |

### Kode error penting
| HTTP | `code` | Arti |
|---|---|---|
| 409 | `INVALID_TRANSITION` | Perubahan status tidak diizinkan aturan |
| 409 | `SLOT_CONFLICT` | Bentrok dengan jadwal terkunci (termasuk jeda perjalanan) |
| 409 | `STALE_STATUS` | Status berubah sejak dilihat admin |
| 409 | `PRICE_NOT_SET` | Minta pembayaran sebelum biaya ditetapkan |
| 409 | `NO_VERIFIED_PAYMENT` | Refund tanpa pembayaran terverifikasi |
| 409 | `PAYMENT_NOT_VERIFIED` | Konfirmasi manual sebelum pembayaran yang cukup terverifikasi |
| 409 | `PAYMENT_PENDING` / `NOT_PAYABLE` / `ALREADY_PAID` | Bukti lain masih diverifikasi / belum tahap pembayaran / sudah lunas |
| 409 | `SLOT_UNAVAILABLE` | (customer) slot sudah terkunci saat submit |
