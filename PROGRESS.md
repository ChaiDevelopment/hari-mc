# Progress Proyek — Hari MC Booking

Terakhir diperbarui: **18 November 2026** (Fase 3 + penyesuaian)
Product owner: Chai · Pemilik bisnis / admin: Hari Susanto

---

## Ringkasan

| Fase | Isi | Status |
|---|---|---|
| **1. Foundation** | Backend API, database, login, keamanan | ✅ **Selesai & teruji** |
| **2. Customer Web** | Landing page, login Google, dashboard, form booking, lacak pesanan | ✅ **Selesai & teruji** |
| **3. Admin CMS** | Dashboard Hari, kelola booking, kalender, pelanggan, pengaturan | ✅ **Selesai & teruji** |
| 4. Android | Aplikasi customer (Kotlin / Jetpack Compose) | ⏳ Berikutnya (menunggu persetujuan) |
| 5. Fitur bisnis | Pembayaran, paket & harga, portfolio, Google Reviews, Instagram, laporan | ⬜ Belum |
| 6. QA | Test lengkap web, Android, keamanan, tampilan di berbagai ukuran layar | ⬜ Belum |
| 7. Deployment | Docker, panduan deploy, backup & recovery | ⬜ Belum |

> **Website pelanggan** (`http://localhost:3400`) dan **CMS admin** (`http://localhost:3400/admin`) sudah bisa dibuka. Cara menjalankan ada di [README.md](README.md). Pelanggan memesan; Hari meninjau, menerima/menolak, menetapkan biaya, dan memantau kalender dari CMS.

---

## Penyesuaian setelah Fase 3 (17–18 November 2026)

- [x] **Login Google aktif.** Web Client ID sudah dipasang di server, dan tombol "Lanjutkan dengan Google" muncul di halaman masuk pelanggan dan admin. Agar bisa login selama status aplikasi di Google masih *Testing*, email harus ditambahkan di **Google Cloud → Audience → Test users**.
- [x] **Halaman login dirapikan.** Form "mode uji" diciutkan menjadi tautan kecil, dan judul tidak lagi tertutup header.
- [x] **Akun demo admin** untuk preview lokal: `demo.hari@hari-mc.local` (nama "Hari Susanto (Demo)"). Login lewat **/admin/masuk → "Masuk tanpa Google (mode uji)"**. Akun ini hanya berfungsi di komputer pengembangan dan diganti ke email Google Hari dengan `admin:provision --email <email> --replace`.
- [x] **Nama "Kak Hari" diganti menjadi "Hari Susanto"** di judul tab browser, logo, CMS, teks halaman, notifikasi, dan FAQ. Nama bisnis resmi **"Jasa MC Ultah Kak Hari"** (sesuai Google Maps) tidak diubah; bisa diganti dari CMS bila perlu.
- [x] **Alur pembayaran diperbaiki** (lihat bagian Fase 3 di bawah dan addendum di [laporan Fase 3](docs/PHASE-3-REPORT.md)). Pembayaran yang langsung melunasi total kini tercatat sebagai **Pelunasan**, bukan DP.
- [x] **Ajakan ulasan Google setelah acara selesai.** Saat Hari menandai acara **Selesai**, pelanggan menerima notifikasi, dan di detail pesanan muncul kartu *"Bagaimana acaranya? Beri ulasan di Google"*. Ajakan dikirim ke **semua** pelanggan yang acaranya selesai, tanpa menyaring dan tanpa imbalan, sesuai kebijakan Google. Pesanan yang batal/ditolak tidak mendapat ajakan.
  - Selama **Place ID** kosong, tombol membuka halaman Google Maps (pelanggan klik "Tulis ulasan").
  - Place ID dapat diisi di **CMS → Pengaturan → Profil & Kontak → Ajakan ulasan Google**; setelah diisi, tombol langsung membuka form ulasan.

- [x] **Masuk / daftar dengan email (kode 6 digit, tanpa password)** menggantikan form "mode uji" di halaman masuk pelanggan. Alurnya: email → kode dikirim ke email → masukkan kode → (akun baru) lengkapi nama & WhatsApp. Pengamanan: kode berlaku 10 menit, sekali pakai, disimpan sebagai hash; maks. 5 percobaan; jeda kirim ulang 60 detik; maks. 5 kode per jam; tidak membocorkan apakah email terdaftar. **Admin tetap wajib Google.**
  - ⚠️ **Butuh layanan email (SMTP)** agar kode benar-benar terkirim. Saat ini di laptop: kode **tidak dikirim**, melainkan tercetak di konsol API dan folder `apps/api/storage/dev-mailbox/`.
  - Tabel baru `email_login_codes` (migration `email_login_codes`).

**Hasil test terakhir (18 Nov):** ✅ API unit 40/40 · API integrasi 118/118 · web unit 10/10 · browser 60/60.

### Status lingkungan saat ini
- Semua masih berjalan **lokal di laptop pengembangan**: website `localhost:3400`, API `localhost:4100`, dan database PostgreSQL di `D:\hari\apps\api\.pgdata`. **Belum ada backup**, dan belum bisa diakses dari luar. Jangan dipakai untuk data pelanggan sungguhan.
- **Rencana online (Fase 7, menunggu persetujuan)**: website & CMS → Cloudflare Workers; file & bukti transfer → Cloudflare R2; API → Cloudflare Containers (atau VPS/Railway); database → PostgreSQL terkelola (Neon/Supabase) via Cloudflare Hyperdrive. Database tidak dipindah ke Cloudflare D1, karena D1 tidak mendukung fitur PostgreSQL yang menjaga aturan anti double-booking.

### Informasi dari Google Maps
Profil "Jasa MC Ultah Kak Hari" beralamat di **Jl. Ir. H. Juanda II Gg. Kingkit 3 No. 20, RT.10/RW.4, Kebon Kelapa, Gambir, Jakarta Pusat 10120**. Alamat ini belum ditampilkan di website; bisa diisi di CMS → Profil & Kontak bila diinginkan. Jumlah ulasan belum bisa dibaca otomatis tanpa Places API.

---

## Yang sudah dikerjakan (Fase 3 — CMS Admin untuk Hari)

Laporan lengkap: [docs/PHASE-3-REPORT.md](docs/PHASE-3-REPORT.md)

- [x] **Login admin** dengan Google; hanya akun Hari yang didaftarkan di server. Pelanggan yang mencoba masuk mendapat halaman "Akses ditolak".
- [x] **Dashboard** dengan angka asli dari database: total, menunggu, diterima, menunggu bayar, terkonfirmasi, selesai, acara mendatang, booking terbaru, agenda 14 hari, dan aktivitas.
- [x] **Kelola pesanan**: cari, filter, detail lengkap, terima, tolak (wajib alasan), minta perubahan, tetapkan biaya & DP, minta pembayaran, konfirmasi, mulai, selesai, dan batalkan. Semuanya dengan konfirmasi, tercatat di riwayat, dan pelanggan menerima notifikasi.
- [x] **Kalender** bulan/minggu/hari/agenda, dengan warna per status, jeda perjalanan, dan penanda bentrok.
- [x] **Data pelanggan**: pencarian, profil, riwayat pesanan, dan total pembayaran terverifikasi.
- [x] **Pengaturan**: profil & foto, kontak, layanan, paket & harga, DP & rekening, transportasi, aturan jadwal, dan portfolio. Harga/DP/transport berstatus **"Belum dikonfigurasi"** sampai Hari mengisinya.
- [x] Sistem **menolak menerima pesanan yang bentrok**, termasuk jeda perjalanan, walaupun diklik bersamaan.
- [x] **Alur pembayaran** (perbaikan): pelanggan mengunggah **bukti transfer**, Hari melihat dan **memverifikasi**, lalu pesanan **otomatis terkonfirmasi**. Setelah itu pelanggan bisa mengirim bukti pelunasan. Bukti bisa ditolak dengan alasan, pembayaran tunai bisa dicatat langsung, dan bukti bersifat privat.

**Hasil test Fase 3 (termasuk perbaikan pembayaran):** ✅ **211 / 211 lulus**. Angka ini mencakup semua test Fase 1–2 yang dijalankan ulang, serta test browser CMS di layar 1440px, 768px, dan 390px.

---

## Yang sudah dikerjakan (Fase 2 — Website Pelanggan)

Laporan lengkap: [docs/PHASE-2-REPORT.md](docs/PHASE-2-REPORT.md)

- [x] **Landing page** premium (navy, warm white, champagne gold) dengan data asli dari database: profil, 7 layanan, cara pemesanan, tautan Instagram & ulasan Google Maps, FAQ, dan kontak. Tanpa harga, rating, atau testimoni buatan.
- [x] **Login Google** siap pakai; aktif otomatis setelah Google Client ID diisi. Ada login uji khusus development.
- [x] **Dashboard pelanggan**: sapaan, statistik, acara berikutnya, pesanan terbaru, notifikasi, dan profil.
- [x] **Form booking** bertahap dan nyaman di HP. Pertanyaannya bisa diubah dari pengaturan (karena Google Form lama belum diverifikasi), dan data akun terisi otomatis.
- [x] **Preview** sebelum kirim, dengan persetujuan kebijakan privasi dan konfirmasi data.
- [x] **Pesanan tersimpan ke database** beserta nomor booking. Klik tombol berkali-kali tetap menghasilkan satu pesanan.
- [x] **Riwayat pesanan, detail, dan pelacakan status** (tahapan + riwayat perubahan), serta pembatalan oleh pelanggan sebelum terkonfirmasi.
- [x] Jadwal yang sudah terisi (termasuk jeda perjalanan) ditolak otomatis.
- [x] Pelanggan **tidak bisa** melihat pesanan milik orang lain.

**Hasil test Fase 2:** ✅ **139 / 139 lulus**. Angka ini mencakup seluruh 47 test Fase 1 yang dijalankan ulang, serta test browser sungguhan di layar desktop 1440px, tablet 768px, dan HP 390px.

---

## Yang sudah dikerjakan (Fase 1)

### 1. Audit & persiapan proyek
- [x] Memeriksa folder proyek (`d:\hari` kosong, tidak ada file yang tertimpa).
- [x] Memeriksa tools di komputer: Node.js, pnpm, Java 17, Gradle, Android SDK tersedia. Docker dan PostgreSQL tidak tersedia.
- [x] Menyiapkan database PostgreSQL 17 yang berjalan tanpa instalasi tambahan (`pnpm db:dev`).
- [x] Menyusun struktur monorepo (satu repositori untuk API, web, dan Android).

### 2. Dokumen perencanaan
- [x] **Arsitektur sistem**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [x] **Desain database**: [docs/DATABASE.md](docs/DATABASE.md)
- [x] **Roadmap fase 1–7**: [docs/ROADMAP.md](docs/ROADMAP.md)
- [x] **Laporan teknis Fase 1**: [docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md)
- [x] **Cara instalasi & menjalankan**: [README.md](README.md)

### 3. Database (18 tabel, siap untuk semua fase)
- [x] Pengguna (customer & admin), profil customer, profil admin, sesi login
- [x] Profil MC Hari Susanto, kategori layanan, paket jasa
- [x] Booking, detail acara, riwayat status booking, lampiran
- [x] Pembayaran & bukti pembayaran
- [x] Portfolio, cache Google Reviews
- [x] Notifikasi & token perangkat (untuk push notification)
- [x] Pengaturan bisnis & audit log

Aturan penting yang **dijaga langsung oleh database** (tidak bisa ditembus walau ada bug di aplikasi):
- [x] **Tidak bisa terjadi double booking.** Dua acara yang sudah diterima tidak boleh bentrok jamnya.
- [x] **Hanya boleh ada satu admin** (Hari Susanto).
- [x] Klik tombol submit berkali-kali **tidak membuat booking ganda**.
- [x] Jam selesai harus setelah jam mulai, DP tidak boleh melebihi total, dan nominal tidak boleh negatif.
- [x] Booking yang sudah punya catatan pembayaran tidak bisa dihapus.

### 4. Data awal (seed)
Hanya berisi data yang **sudah diberikan pemilik**:
- [x] Profil: Hari Susanto, "Jasa MC Ultah Kak Hari", Gambir, Jakarta Pusat, Instagram `@hari.jasamc`, dan link Google Maps.
- [x] 7 kategori acara: Ulang Tahun Anak, Sweet Seventeen, Gathering, Family Event, Lomba, Grand Opening, Acara Lainnya.
- [x] Struktur form booking yang bisa diubah, ditandai **"belum diverifikasi dengan Google Form lama"**.

Sengaja **tidak** dibuat: harga/paket, rating, jumlah review, testimoni, atau pelanggan contoh.

### 5. Login & keamanan
- [x] Login dengan akun Google untuk customer dan admin, **tanpa password**.
- [x] Token Google diverifikasi di server, sehingga data dari aplikasi tidak dipercaya begitu saja.
- [x] Akun customer dibuat otomatis saat login pertama.
- [x] Hari dijadikan admin lewat perintah khusus di server. **Tidak ada halaman pendaftaran admin.**
- [x] Sesi login aman: jika ada indikasi token dicuri, semua sesi akun itu langsung dicabut.
- [x] Logout dan akun yang dinonaktifkan langsung kehilangan akses.
- [x] Customer **tidak bisa** mengakses halaman/fitur admin.
- [x] Pembatasan jumlah percobaan login (anti brute-force).
- [x] Semua aktivitas penting tercatat di audit log.

### 6. API yang sudah berfungsi
| Endpoint | Fungsi | Akses |
|---|---|---|
| `GET /health` | Cek server & database hidup | Publik |
| `GET /mc-profile` | Profil Hari Susanto | Publik |
| `GET /services` | Daftar kategori acara & paket aktif | Publik |
| `POST /auth/google` | Login dengan Google | Publik |
| `POST /auth/refresh` | Memperpanjang sesi login | Publik (butuh sesi) |
| `POST /auth/logout` | Logout | Publik (butuh sesi) |
| `GET /auth/me` | Data user yang sedang login | Login |
| `GET/PATCH /me/profile` | Lihat/ubah profil customer (WhatsApp, kota) | Customer |
| `GET /admin/audit-logs` | Riwayat aktivitas sistem | Admin |

Dokumentasi API interaktif tersedia di `http://localhost:4100/api/docs` saat server berjalan.

### 7. Hasil pengujian
| Jenis test | Hasil |
|---|---|
| Unit test | ✅ 12 / 12 lulus |
| Test login & sesi | ✅ 10 / 10 lulus |
| Test hak akses (customer vs admin) | ✅ 9 / 9 lulus |
| Test integritas database (double booking, transaksi, dll.) | ✅ 16 / 16 lulus |
| **Total** | ✅ **47 / 47 lulus** |

Contoh yang dibuktikan: 10 percobaan menerima booking di jam yang sama secara bersamaan menghasilkan **tepat 1** yang berhasil.

---

## Yang dibutuhkan dari pemilik

| # | Kebutuhan | Untuk apa | Status |
|---|---|---|---|
| 1 | Email Google milik Hari Susanto | Menjadikan Hari admin (perintah sudah siap) | ⬜ Belum ada |
| 2 | Google OAuth Client ID | Login Google | ✅ **Web sudah dipasang** · ⬜ Android (Fase 4) · ⬜ domain produksi perlu ditambahkan ke *Authorized JavaScript origins* saat online |
| 3 | Isi / screenshot Google Form lama | Mencocokkan pertanyaan form booking | ⬜ Belum ada |
| 4 | Daftar paket, harga, kebijakan DP, biaya transport | **Bisa diisi Hari sendiri di CMS** → Pengaturan | ⬜ Belum diisi |
| 5 | Foto profesional Hari & materi portfolio | **Bisa diunggah di CMS** → Pengaturan | ⬜ Belum diisi |
| 6 | Nomor WhatsApp bisnis resmi | **Bisa diisi di CMS** → Profil & Kontak | ⬜ Belum diisi |
| 7 | Firebase, **Google Places API key** (+ billing aktif), akses Instagram API | Notifikasi, rating & ulasan Google di halaman awal, feed Instagram | ⬜ Belum ada (ada tampilan cadangan jika tidak tersedia) |
| 8 | Akun **Cloudflare** (+ domain bila ada), akun **Neon/Supabase** | Mengonlinekan website (Fase 7) | ⬜ Belum ada |
| 11 | **Layanan email (SMTP)**: host, port, user, password, alamat pengirim — mis. Brevo/Resend/Mailgun/SES/Gmail app password | Agar kode masuk via email benar-benar terkirim ke pelanggan | ⬜ Belum ada (development: kode di konsol server) |
| 10 | **Place ID** Google bisnis (opsional) | Tombol ulasan langsung ke form "Tulis ulasan" | ⬜ Belum diisi (sementara memakai link Google Maps) |
| 9 | Test users di Google Cloud | Agar email Anda/Hari bisa login Google selama mode *Testing* | ⬜ Perlu dicek |

## Asumsi yang perlu dikonfirmasi
- Jeda perjalanan antar-acara **60 menit**.
- Booking paling lambat **24 jam** sebelum acara.
- Booking berstatus **PENDING belum mengunci jadwal**. Jadwal baru terkunci setelah Hari menerima booking.
- Sesi login admin berlaku **7 hari**, customer **30 hari**.

Semua asumsi di atas bisa diubah lewat pengaturan tanpa mengubah kode.

---

## Langkah berikutnya: Fase 4 (Aplikasi Android) — menunggu persetujuan laporan Fase 3
- Proyek Kotlin + Jetpack Compose (Material 3)
- Login Google (Credential Manager), penyimpanan token aman
- Beranda, form booking, pesanan saya, dan notifikasi
- Terhubung ke API & database yang sama
