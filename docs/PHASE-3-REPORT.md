# Phase 3 — Admin CMS: Laporan

Tanggal: 17 November 2026

## Ringkasan
Hari Susanto kini memiliki CMS web di `/admin`. CMS ini memakai API, database, dan sistem login yang sama dengan website pelanggan, tanpa database kedua atau sistem autentikasi terpisah. Setiap tindakan admin divalidasi di server, dicatat di audit log, dan tidak dapat mem-bypass aturan double booking.

Audit awal mengonfirmasi bahwa kode sesuai dengan laporan Phase 1–2: seluruh rute aktif cocok dan baseline 35 + 70 + 10 test lulus. Satu-satunya celah adalah endpoint admin yang baru berisi `audit-logs`.

## 1. Fitur yang selesai

**Autentikasi admin**
- Login Google memakai endpoint yang sama dengan pelanggan.
- Hanya akun yang diprovisioning lewat CLI yang menjadi ADMIN. Database menjamin hanya ada satu admin aktif, dan tidak ada registrasi admin.
- Pelanggan yang membuka `/admin` dialihkan ke halaman **Akses ditolak** (dengan tombol keluar/ganti akun). Semua API `/admin/*` mengembalikan 403 untuk pelanggan dan 401 untuk pengunjung anonim, dan ini diuji otomatis untuk ke-28 operasi admin.
- Logout tersedia dari sidebar.
- Untuk pengujian lokal sebelum Google Client ID ada: `ENABLE_DEV_ADMIN_LOGIN` (opt-in, ditolak di production) hanya bisa masuk ke admin yang **sudah diprovisioning** dan belum terikat Google. Mekanisme ini tidak pernah membuat admin.

**Dashboard**
- Total booking dan jumlah per status: menunggu, diterima, menunggu bayar, terkonfirmasi, selesai.
- Acara mendatang (yang jadwalnya terkunci), booking terbaru, agenda 14 hari, dan notifikasi aktivitas.
- Peringatan untuk booking PENDING yang bentrok dengan jadwal terkunci.
- Semua angka berasal dari database. Test E2E membandingkan angka di UI dengan angka di database.

**Manajemen booking**
- Pencarian berdasarkan nama, nomor booking, email, WhatsApp, atau nama acara.
- Filter status (dengan tab dan jumlah per status), kategori, dan rentang tanggal acara; pengurutan dan paginasi. State filter tersimpan di URL.
- Halaman detail berisi: kontak pelanggan (dengan tombol WhatsApp), jadwal + jeda perjalanan, lokasi + Maps, kebutuhan MC, lampiran, pembayaran, jadwal berdekatan/bentrok, dan riwayat perubahan beserta aktor dan catatannya.
- Aksi mengikuti aturan transisi server: terima, tolak (alasan wajib), minta pembayaran, konfirmasi pembayaran, mulai, selesai, batalkan (alasan wajib), dan refund (hanya jika ada pembayaran terverifikasi). Ada juga **minta perubahan** jadwal/informasi, yang tidak mengubah status.
- Setiap aksi memakai dialog konfirmasi dan menampilkan toast. `expectedStatus` mencegah aksi atas tampilan yang sudah basi.
- **Rincian biaya**: total dihitung server; DP tidak boleh melebihi total; nominal harus rupiah bulat dan tidak negatif. Biaya hanya bisa diubah pada status PENDING/ACCEPTED/WAITING_PAYMENT.

**Kalender (FullCalendar 6)**
- Tampilan bulan, minggu, hari, dan agenda, dengan navigasi tanggal. Di HP default ke tampilan agenda.
- Warna berbeda per status. Jadwal terkunci bergaris tegas; PENDING bergaris putus-putus karena belum mengunci jadwal.
- Blok **jeda perjalanan** tampil di tampilan minggu/hari.
- **Penanda bentrok** dihitung terhadap semua booking aktif, bukan hanya yang lolos filter.
- Filter status. Klik event membuka detail dengan tautan ke booking.

**Pelanggan**
- Daftar dengan pencarian nama/email/WA, plus profil (WA, kota), riwayat booking, dan statistik.
- Total transaksi menghitung **pembayaran terverifikasi saja** (DP + pelunasan − refund).
- Data sensitif (Google ID, token, IP) tidak ditampilkan.

**Pengaturan bisnis**
- **Profil & kontak**: nama, nama bisnis, tagline, deskripsi, lokasi, Instagram, Google Maps, WhatsApp, email, dan upload foto profil.
- **Layanan & paket**: tambah dan nonaktifkan kategori; buat, ubah, dan arsipkan paket dengan harga, durasi, dan fasilitas.
- **DP & rekening** dan **biaya transportasi**: status awal *Belum dikonfigurasi* tanpa nilai default.
- **Aturan jadwal**: ditandai *"Nilai awal (asumsi) — belum dikonfirmasi"* sampai Hari menyimpannya.
- **Portfolio**: upload foto, tautan video, judul/caption, urutan, tampil/sembunyi, dan hapus (soft delete).

**Dampak ke sisi pelanggan** (tanpa mengubah alur Phase 2)
- Landing menampilkan portfolio aktif dan selalu memakai data terbaru dari CMS (`no-store`).
- Detail pesanan menampilkan **cara pembayaran** saat status *Menunggu Pembayaran*.
- Admin yang membuka halaman pelanggan mendapat tautan ke CMS.

## 2. File baru & yang diubah

### Backend (`apps/api`)
| File | Status |
|---|---|
| `src/admin/admin-bookings.service.ts` | baru: daftar/detail, transisi (advisory lock + cek bentrok + jeda), minta perubahan, rincian biaya |
| `src/admin/admin-overview.service.ts` | baru: dashboard, kalender (`detectConflicts`), pelanggan |
| `src/admin/admin.controllers.ts`, `admin-settings.controller.ts`, `admin.module.ts` | baru |
| `src/admin/dto/admin-bookings.dto.ts`, `dto/admin-settings.dto.ts` | baru: validasi semua input admin |
| `src/storage/storage.service.ts`, `media.controller.ts`, `storage.module.ts`, `portfolio-view.ts` | baru: upload (magic bytes), media publik anti path traversal |
| `src/auth/auth.service.ts`, `auth.controller.ts` | diubah: opsi dev-login admin (opt-in) + `devAdminLoginEnabled` di `/auth/config` |
| `src/config/env.ts` | diubah: `ENABLE_DEV_ADMIN_LOGIN`, `STORAGE_DIR` + aturan production |
| `src/bookings/bookings.service.ts` | diubah: `paymentInstructions` saat WAITING_PAYMENT |
| `src/settings/site.controller.ts` | diubah: portfolio aktif di `/site` |
| `src/app.module.ts`, `prisma/seed.ts` | diubah: AdminModule; setting `transport_fee` (UNSET) |
| `test/admin.e2e-spec.ts`, `src/admin/admin-overview.spec.ts` | baru |
| `src/config/env.spec.ts`, `test/bookings.e2e-spec.ts`, `test/global-setup.ts`, `test/global-teardown.ts` | diubah (lihat §5) |
| `package.json` | `multer`, `@types/multer` |

### Frontend (`apps/web`)
| Path | Isi |
|---|---|
| `src/app/admin/(auth)/masuk`, `(auth)/tidak-diizinkan` | Login admin, akses ditolak |
| `src/app/admin/(cms)/layout.tsx`, `page.tsx` | Shell CMS + dashboard |
| `src/app/admin/(cms)/pesanan`, `pesanan/[id]` | Manajemen & detail booking |
| `src/app/admin/(cms)/kalender` | Kalender |
| `src/app/admin/(cms)/pelanggan`, `pelanggan/[id]` | Pelanggan |
| `src/app/admin/(cms)/pengaturan` | Pengaturan (5 tab) |
| `src/components/admin/*` | Sidebar/drawer, toast, dialog konfirmasi, kartu statistik, tabel booking responsif |
| `src/lib/admin-types.ts` | Tipe data CMS |
| `src/lib/api.ts` | `apiUpload`; `logout(redirectTo)` |
| `src/app/globals.css`, `next.config.ts` | Tema FullCalendar; CSP `font-src data:` (ikon kalender) |
| `src/app/page.tsx`, `akun/pesanan/[id]/page.tsx`, `components/customer-shell.tsx`, `lib/server-api.ts`, `lib/types.ts` | Portfolio di landing, instruksi bayar, tautan CMS, data tanpa cache |
| `e2e/admin.spec.ts`, `e2e/global-setup.ts`, `playwright.config.ts` | E2E CMS; admin uji diprovisioning via CLI; 1 worker |

### Dokumentasi
`docs/API.md` (baru), `docs/PHASE-3-REPORT.md` (baru), `README.md`, `docs/ROADMAP.md`, `PROGRESS.md`.

## 3. Endpoint baru
28 operasi admin + `GET /media/:key`. Daftar lengkap ada di [API.md](API.md) dan Swagger `/api/docs`. Tidak ada endpoint lama yang diubah perilakunya; `/auth/config` hanya mendapat field tambahan.

## 4. Perubahan database
**Tidak ada perubahan skema atau migration.** Seluruh constraint Phase 1 tetap utuh, termasuk exclusion constraint anti double-booking dan single-admin index. Tambahan hanya berupa data setting `transport_fee` (`mode: UNSET`) lewat seed.

Lapisan baru di aplikasi (bukan menggantikan constraint DB):
- `pg_advisory_xact_lock` menserialisasi semua transisi ke status pengunci jadwal, sehingga cek **jeda perjalanan** aman dari race condition.
- `updateMany … where status = <lama>` mencegah perubahan ganda.
- Pelanggaran exclusion constraint tetap ditangkap dan diterjemahkan menjadi 409.

## 5. Hasil pengujian (semua dijalankan, bukan klaim)
| Suite | Hasil |
|---|---|
| API unit (Phase 1–3; termasuk `detectConflicts`, deteksi gambar, env dev-admin) | **40/40** |
| API e2e (auth, RBAC, database, booking, **admin**) | **99/99** |
| Web unit (vitest) | **10/10** |
| Web E2E Playwright full-stack × 3 viewport (1440/768/390): 8 skenario pelanggan + 9 skenario CMS | **51/51** |
| **Total** | **200/200** |

Cakupan test Phase 3 di API e2e (29 test):
- Customer tidak bisa memakai endpoint admin untuk booking-nya sendiri; admin yang di-suspend langsung kehilangan akses.
- Angka dashboard sesuai database, termasuk penghitungan PENDING yang bentrok.
- Pencarian dan filter (nama, nomor booking, WA, status jamak, kategori, rentang tanggal, paginasi, jumlah per status, input tidak valid).
- **Alur status penuh** dengan timestamp, log, aktor, audit, dan notifikasi pelanggan. Transisi ilegal ditolak; status final terkunci; `expectedStatus` basi ditolak; refund hanya dengan pembayaran terverifikasi; riwayat pembayaran tidak terhapus.
- **Anti double-booking**:
  - Bentrok langsung dan bentrok karena jeda perjalanan ditolak.
  - 6 penerimaan paralel di slot yang sama → tepat 1 berhasil.
  - 5 penerimaan paralel yang hanya bentrok lewat jeda → yang diterima selalu berjarak ≥ 60 menit.
- Minta perubahan; validasi nominal (negatif, pecahan, string, DP > total, diskon > biaya, manipulasi `totalAmount`); biaya terkunci setelah CONFIRMED.
- Kalender: rentang waktu, konflik tetap terdeteksi walau difilter, validasi rentang.
- Pelanggan: pencarian, detail tanpa data sensitif, total hanya dari pembayaran terverifikasi.
- Pengaturan: default "belum dikonfigurasi", validasi URL/WA/foto, perubahan tampil di `/site`, snapshot harga booking lama tidak berubah, arsip paket/kategori.
- Upload: file bukan gambar ditolak meskipun bernama `.png`, file > 5 MB → 413, path traversal → 404, portfolio CRUD/urutan/soft delete.
- Audit log tercatat untuk setiap aksi.
- Dev login admin: nonaktif secara default, tidak pernah membuat admin, dan menolak akun yang sudah terikat Google.

Skenario E2E browser CMS (setiap viewport): redirect anonim, penolakan pelanggan (UI + API 403), dashboard = database, cari → detail → terima → biaya (DP > total ditolak) → minta pembayaran → pelanggan melihat statusnya, tolak tanpa alasan dicegah lalu dengan alasan berhasil, minta perubahan, kalender 4 tampilan + klik event, pelanggan, paket baru tampil di website lalu diarsipkan, navigasi + logout, dan **tanpa scroll horizontal**.

### Masalah yang ditemukan & diperbaiki
1. **Cache landing 60 detik**: perubahan CMS (harga/profil) terlambat muncul di website → data landing kini `no-store`.
2. **Overflow horizontal dashboard di 390px**: kolom grid tanpa `min-w-0` → diperbaiki.
3. **Ikon panah kalender tidak tampil**: CSP memblokir font ikon FullCalendar (`data:`) → `font-src 'self' data:`.
4. Kartu "Kebutuhan MC" kosong tanpa keterangan → kini tampil "Tidak ada catatan khusus".
5. Test E2E: data kini unik per viewport. Booking yang sudah diterima di satu viewport membuat slot yang sama ditolak (409) di viewport berikutnya. **Ini perilaku sistem yang benar**, jadi yang disesuaikan adalah data test-nya.
6. Penyesuaian test lama: ekspektasi `/auth/config` ditambah field `devAdminLoginEnabled: false`. Tidak ada test lama yang dilonggarkan.

## 6. Cara menjalankan CMS
```bash
pnpm db:dev                          # terminal 1
pnpm api:build && pnpm api:start     # terminal 2 → :4100
pnpm web:build && pnpm web:start     # terminal 3 → :3400
```
Buka **http://localhost:3400/admin**.

## 7. Mengaktifkan akun Hari sebagai admin
Jalankan **di server** (bukan dari browser). Tidak ada email yang ditanam di kode atau konfigurasi:
```bash
pnpm --filter @hmc/api admin:provision --email <email-google-hari>
#   atau set ADMIN_EMAIL=<email> di apps/api/.env lalu jalankan tanpa --email
```
- Setelah `GOOGLE_CLIENT_IDS` diisi, Hari login dengan Google di `/admin/masuk`. Login pertama mengikat akun Google-nya.
- Mengganti admin: tambahkan `--replace`. Admin lama otomatis menjadi pelanggan dan semua sesinya dicabut.
- **Uji lokal sebelum ada Google Client ID**: provision dengan email Google milik Anda sendiri, pastikan `ENABLE_DEV_LOGIN=true` dan `ENABLE_DEV_ADMIN_LOGIN=true` di `apps/api/.env` (keduanya sudah aktif di `.env` lokal), lalu gunakan form "Mode pengembangan" di `/admin/masuk`. Setelah email Hari tersedia, jalankan `admin:provision --email <email-hari> --replace`.

## 8. Fitur yang belum selesai (sesuai roadmap)
- **Pencatatan & verifikasi pembayaran** (tabel `payments` + bukti bayar sudah ada, UI menyusul di Phase 5). Saat ini "Konfirmasi pembayaran" adalah keputusan manual admin, dan refund mensyaratkan pembayaran terverifikasi.
- Upload lampiran booking oleh pelanggan, dan upload video (sekarang berupa tautan).
- Pelanggan belum bisa *mengedit* pesanan sebagai tanggapan atas "minta perubahan"; responsnya lewat WhatsApp, atau batal lalu pesan ulang.
- Editor form booking (pertanyaan tambahan) di CMS. Strukturnya sudah configurable di database, tetapi UI editornya menunggu isi Google Form lama.
- Laporan + export CSV, integrasi Google Reviews/Instagram API, push notification (FCM), dan object storage production (Phase 5/7).
- Kalender tidak mendukung drag & drop untuk memindah jadwal. Ini disengaja: perubahan jadwal harus lewat konfirmasi pelanggan.

## 9. Data & kredensial yang masih dibutuhkan
| # | Kebutuhan | Untuk |
|---|---|---|
| 1 | **Email Google Hari Susanto** | `admin:provision` |
| 2 | **Google OAuth Web Client ID** (+ Authorized origin `http://localhost:3400` dan domain production) | Login Google pelanggan & admin |
| 3 | Isi/screenshot Google Form lama | Verifikasi form booking |
| 4 | Paket, harga, kebijakan DP, rekening, biaya transport | **Diisi Hari sendiri lewat CMS** |
| 5 | Foto profesional, nomor WhatsApp bisnis, materi portfolio | Diisi lewat CMS |
| 6 | Konfirmasi aturan jadwal (jeda 60 menit, minimal 24 jam) | Simpan di CMS → Pengaturan → Aturan Jadwal |
| 7 | Firebase, Google Places API, Instagram API | Phase 4–5 |

---

## Addendum — Perbaikan alur pembayaran (17 Nov 2026, atas temuan product owner)

### Anomali yang ditemukan
1. Pelanggan berstatus "Menunggu Pembayaran" **tidak bisa melakukan apa pun** selain membatalkan. Tidak ada cara mengirim bukti transfer, dan tabel `payments` tidak pernah diisi aplikasi.
2. "Konfirmasi pembayaran" di CMS hanya mengubah status **tanpa mencatat pembayaran**, sehingga total transaksi pelanggan tetap Rp 0.
3. Akibatnya pesanan yang sudah "dibayar" lalu dibatalkan **tidak bisa di-refund**, karena refund mensyaratkan pembayaran terverifikasi.
4. Instruksi bayar disembunyikan jika rekening belum diisi; jumlah yang harus dibayar (DP/pelunasan) tidak jelas.

### Alur baru
**Menunggu Pembayaran → pelanggan unggah bukti transfer → Hari lihat bukti → Verifikasi → otomatis Terkonfirmasi.** Setelah itu pelanggan dapat mengirim bukti **pelunasan** sampai lunas.
- Jumlah yang ditagih: **DP**, atau **total** bila DP tidak ditetapkan. Setelah terkonfirmasi, yang ditagih adalah sisa pelunasan.
- Hari dapat **menolak** bukti dengan alasan; pelanggan melihat alasannya dan bisa mengirim ulang.
- Hari dapat **mencatat pembayaran tunai** secara langsung (langsung terverifikasi).
- "Konfirmasi pembayaran" manual kini **ditolak server** (`PAYMENT_NOT_VERIFIED`) sampai pembayaran yang cukup terverifikasi.
- Bukti bayar disimpan **privat** (bukan di folder media publik): hanya pemilik pesanan dan admin yang bisa melihatnya, dengan `Cache-Control: no-store`.
- Satu bukti menunggu verifikasi per pesanan; nominal tidak boleh melebihi sisa tagihan; baris pesanan dikunci (`FOR UPDATE`) selama proses.
- Dashboard CMS: peringatan "N bukti pembayaran menunggu verifikasi", dan daftar pesanan diberi label "Bukti bayar".
- Notifikasi: admin menerima *bukti masuk*; pelanggan menerima *terkirim / ditolak / diterima / terkonfirmasi*. Semua tercatat di audit log.

Tidak ada perubahan skema database; tabel `payments` dan `payment_proofs` dari Phase 1 akhirnya dipakai.

### File
- API baru: `src/payments/payments.service.ts`, `payments.controller.ts`, `payments.module.ts`, `test/payments.e2e-spec.ts`.
- API diubah: `storage.service.ts` (penyimpanan privat + deteksi PDF), `bookings.service.ts`, `admin-bookings.service.ts` (guard konfirmasi, ringkasan pembayaran), `admin-overview.service.ts`, `app.module.ts`.
- Web baru: `components/payment-panel.tsx`, `components/admin/admin-payments.tsx`.
- Web diubah: detail pesanan pelanggan & admin, tabel booking, dashboard, `lib/api.ts` (`openPrivateFile`), tipe, CSP `img-src blob:`.

### Test (semua dijalankan)
| Suite | Hasil |
|---|---|
| API unit | 40/40 |
| API e2e (termasuk 8 test pembayaran baru) | **107/107** |
| Web unit | 10/10 |
| Web E2E 3 viewport (termasuk alur unggah bukti → verifikasi) | **54/54** |
| **Total** | **211/211** |

Test Phase 3 "alur lengkap" diperbarui. Sebelumnya test itu mengonfirmasi pembayaran tanpa catatan pembayaran apa pun, yaitu persis anomali #2. Kini test tersebut membuktikan konfirmasi tanpa pembayaran ditolak, lalu mencatat DP dan memastikan pesanan otomatis terkonfirmasi.

### Catatan
- Pembayaran online otomatis (Midtrans/Xendit) belum aktif. Kolom `gateway_provider` dan `gateway_reference` sudah tersedia untuk Phase 5.
- Refund belum mencatat nominal pengembalian dana sebagai transaksi tersendiri; status REFUNDED menandai bahwa dana sudah dikembalikan.

---

## Addendum 2 — Ajakan ulasan Google (18 Nov 2026)
- Saat acara ditandai **Selesai**, pelanggan menerima notifikasi *"Acara selesai — bagikan pengalaman Anda"* (dengan `reviewUrl`), dan detail pesanan menampilkan kartu ajakan ulasan.
- Ajakan diberikan ke **semua** pesanan yang selesai, tanpa *review gating* dan tanpa imbalan, sesuai kebijakan Google. Pesanan yang batal/ditolak tidak mendapat ajakan.
- Tautan: dengan Place ID → `https://search.google.com/local/writereview?placeid=…`; tanpa Place ID → URL Google Maps bisnis.
- CMS: kartu "Ajakan ulasan Google" di Pengaturan → Profil & Kontak (validasi Place ID, tercatat di audit log).
- Perbaikan kecil: pembayaran pertama yang langsung melunasi total dicatat sebagai **Pelunasan**, bukan DP.
- Test: API integrasi **109/109** (+2), browser **57/57** (+3: alur sampai selesai → kartu ulasan di 3 viewport), API unit 40/40, web unit 10/10.

---

## Addendum 3 — Masuk / daftar dengan kode email (18 Nov 2026)
- Form "mode uji" dihapus dari halaman masuk pelanggan. Gantinya **kode 6 digit via email** (passwordless); masuk dan daftar jadi satu alur. Akun baru diminta melengkapi nama dan WhatsApp setelah kode benar.
- Keamanan:
  - Kode di-hash (SHA-256 + secret server), berlaku 10 menit, sekali pakai (update bersyarat), dan kode lama batal saat kode baru diminta.
  - Maks. 5 percobaan; jeda kirim ulang 60 detik; maks. 5 kode/jam/email; rate limit per IP.
  - Respons permintaan kode identik untuk semua email. Admin dan akun nonaktif tidak dikirimi kode, dan verifikasi admin ditolak (admin wajib Google).
- Pengiriman email melalui adapter `Mailer`: `smtp` (nodemailer) atau `log`. Mode `log` hanya untuk development: kode ditulis ke konsol dan `STORAGE_DIR/dev-mailbox`, dan otomatis nonaktif di production.
- Database: tabel baru **`email_login_codes`** (migration `*_email_login_codes`, dengan CHECK email lowercase & attempts ≥ 0).
- Endpoint login uji API tetap ada khusus untuk test otomatis (tidak di UI, ditolak di production). Helper E2E kini login via API dan menunggu pemulihan sesi selesai.
- Test: API integrasi **118/118** (+9 test login email), browser **60/60** (+3: alur daftar via kode email di 3 viewport), API unit 40/40, web unit 10/10.
