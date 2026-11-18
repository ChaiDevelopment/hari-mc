/**
 * Seed awal — idempoten. Hanya berisi data bisnis yang SUDAH diberikan pemilik.
 * TIDAK membuat: harga/paket, rating, review, testimoni, pelanggan, atau booking contoh.
 * Re-run tidak menimpa perubahan yang sudah dibuat admin (update: {}).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICES = [
  { slug: 'ulang-tahun-anak', name: 'Ulang Tahun Anak' },
  { slug: 'sweet-seventeen', name: 'Sweet Seventeen' },
  { slug: 'gathering', name: 'Gathering' },
  { slug: 'family-event', name: 'Family Event' },
  { slug: 'lomba', name: 'Lomba' },
  { slug: 'grand-opening', name: 'Grand Opening' },
  { slug: 'acara-lainnya', name: 'Acara Lainnya' },
];

/**
 * Definisi form booking yang configurable.
 * PENTING: Google Form lama (https://forms.gle/ZQ1319ddGT4pPhS16) BELUM berhasil dibaca.
 * Field di bawah adalah usulan berdasarkan brief, bukan salinan form lama.
 * `verifiedAgainstOriginalForm: false` → wajib dicek setelah pemilik memberi screenshot/isi form asli.
 */
const BOOKING_FORM = {
  version: 1,
  legacyFormUrl: 'https://forms.gle/ZQ1319ddGT4pPhS16',
  verifiedAgainstOriginalForm: false,
  sections: [
    {
      id: 'customer',
      title: 'Data Pemesan',
      fields: [
        { key: 'contactName', label: 'Nama lengkap', type: 'text', required: true, core: true },
        { key: 'contactEmail', label: 'Email', type: 'email', required: true, core: true },
        { key: 'contactWhatsapp', label: 'Nomor WhatsApp', type: 'phone', required: true, core: true },
      ],
    },
    {
      id: 'event',
      title: 'Data Acara',
      fields: [
        { key: 'eventName', label: 'Nama acara', type: 'text', required: true, core: true },
        { key: 'serviceId', label: 'Kategori acara', type: 'service', required: true, core: true },
        { key: 'eventDate', label: 'Tanggal acara', type: 'date', required: true, core: true },
        { key: 'startTime', label: 'Jam mulai', type: 'time', required: true, core: true },
        { key: 'endTime', label: 'Jam selesai', type: 'time', required: true, core: true },
        { key: 'timezone', label: 'Zona waktu', type: 'timezone', required: true, core: true, default: 'Asia/Jakarta' },
        { key: 'venueName', label: 'Nama tempat acara', type: 'text', required: true, core: true },
        { key: 'address', label: 'Alamat lengkap', type: 'textarea', required: true, core: true },
        { key: 'mapsUrl', label: 'Link Google Maps', type: 'url', required: false, core: true },
        { key: 'city', label: 'Kota', type: 'text', required: true, core: true },
        { key: 'guestCount', label: 'Estimasi jumlah tamu', type: 'number', required: false, core: true },
      ],
    },
    {
      id: 'mc',
      title: 'Kebutuhan MC',
      fields: [
        { key: 'concept', label: 'Konsep acara', type: 'textarea', required: false, core: true },
        { key: 'language', label: 'Bahasa acara', type: 'select', required: false, core: true, options: ['Bahasa Indonesia', 'English', 'Bilingual (Indonesia & English)'] },
        { key: 'dressCode', label: 'Dress code', type: 'text', required: false, core: true },
        { key: 'rundown', label: 'Rundown acara', type: 'textarea', required: false, core: true },
        { key: 'activityDescription', label: 'Deskripsi kegiatan', type: 'textarea', required: false, core: true },
        { key: 'specialRequests', label: 'Permintaan khusus', type: 'textarea', required: false, core: true },
        { key: 'additionalNotes', label: 'Catatan tambahan', type: 'textarea', required: false, core: true },
      ],
    },
    {
      id: 'package',
      title: 'Paket',
      fields: [{ key: 'packageId', label: 'Pilihan paket', type: 'package', required: false, core: true }],
    },
  ],
  /** Pertanyaan tambahan (non-core) — jawabannya disimpan di bookings.form_answers. Kosong sampai form lama diverifikasi. */
  extraQuestions: [] as unknown[],
};

async function main() {
  await prisma.mcProfile.upsert({
    where: { singleton: true },
    update: {},
    create: {
      displayName: 'Hari Susanto',
      businessName: 'Jasa MC Ultah Kak Hari',
      tagline: 'MC Profesional untuk Berbagai Acara',
      bio: 'MC Profesional untuk Berbagai Acara. Ramah, interaktif, tepat waktu, dan siap membuat acara lebih seru, meriah, serta berkesan.',
      locationLabel: 'Gambir, Jakarta Pusat, Indonesia',
      instagramUrl: 'https://www.instagram.com/hari.jasamc/',
      instagramHandle: 'hari.jasamc',
      googleMapsUrl: 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9',
      // photoUrl, whatsappNumber, contactEmail: belum diberikan pemilik → diisi lewat CMS.
    },
  });

  for (const [i, s] of SERVICES.entries()) {
    await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: { ...s, sortOrder: i + 1 },
    });
  }

  const settings: Array<{ key: string; value: object; description: string }> = [
    { key: 'booking_form', value: BOOKING_FORM, description: 'Definisi form booking (configurable).' },
    {
      key: 'booking_rules',
      value: {
        // Asumsi teknis (bisa diubah di CMS): jeda perjalanan antar acara untuk cek bentrok jadwal.
        travelBufferMinutes: 60,
        minLeadTimeHours: 24,
        maxAdvanceDays: 365,
      },
      description: 'Aturan jadwal. Nilai awal adalah asumsi teknis, bukan kebijakan dari pemilik.',
    },
    {
      key: 'payment_info',
      value: { depositPolicy: null, bankAccounts: [], instructions: null },
      description: 'Kebijakan DP & rekening. Belum diberikan pemilik — isi lewat CMS.',
    },
    {
      key: 'transport_fee',
      value: { mode: 'UNSET', flatAmount: null, notes: null },
      description: 'Kebijakan biaya transportasi. UNSET = belum dikonfigurasi pemilik.',
    },
    {
      key: 'google_reviews',
      value: { enabled: false, placeId: null, mapsUrl: 'https://maps.app.goo.gl/irDUBezF4pZKcfYA9' },
      description: 'Isi Place ID + GOOGLE_PLACES_API_KEY untuk menampilkan review resmi. Fallback: link Maps.',
    },
    {
      key: 'instagram',
      value: { handle: 'hari.jasamc', profileUrl: 'https://www.instagram.com/hari.jasamc/', graphApiEnabled: false },
      description: 'Meta Graph API butuh akun Business/Creator + token. Fallback: link profil + portfolio manual.',
    },
    {
      key: 'faq',
      // Hanya menjelaskan cara kerja platform ini — tidak memuat harga, area layanan, atau kebijakan
      // bisnis yang belum diberikan pemilik. Dapat diubah lewat CMS.
      value: [
        {
          question: 'Bagaimana cara memesan jasa MC Hari Susanto?',
          answer:
            'Masuk dengan akun Google, isi formulir pemesanan, periksa ringkasan pesanan, lalu kirim. Anda akan mendapatkan nomor booking dan dapat memantau statusnya di halaman Akun.',
        },
        {
          question: 'Apakah pesanan langsung terkonfirmasi?',
          answer:
            'Belum. Pesanan berstatus "Menunggu Konfirmasi" sampai Hari Susanto meninjau jadwal dan kebutuhan acara Anda. Setiap perubahan status akan terlihat di halaman detail pesanan.',
        },
        {
          question: 'Bagaimana dengan rincian biaya?',
          answer:
            'Jika Anda memilih paket, harga paket tercatat saat pesanan dikirim. Jika belum ada paket yang dipilih, rincian biaya akan dikonfirmasi langsung oleh Hari Susanto setelah meninjau pesanan.',
        },
        {
          question: 'Bisakah saya membatalkan pesanan?',
          answer:
            'Pesanan yang belum terkonfirmasi dapat dibatalkan sendiri dari halaman detail pesanan. Untuk pesanan yang sudah terkonfirmasi, silakan hubungi Hari Susanto.',
        },
      ],
      description: 'FAQ landing page. Isi awal hanya menjelaskan alur platform.',
    },
  ];
  for (const s of settings) {
    await prisma.businessSetting.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  const counts = {
    mcProfile: await prisma.mcProfile.count(),
    services: await prisma.service.count(),
    settings: await prisma.businessSetting.count(),
    packages: await prisma.servicePackage.count(),
  };
  console.log('[seed] selesai', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
