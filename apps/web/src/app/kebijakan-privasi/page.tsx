import type { Metadata } from 'next';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Container } from '@/components/ui';
import { getSite } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Kebijakan Privasi' };
export const dynamic = 'force-dynamic';

/**
 * Isi disusun berdasarkan data yang BENAR-BENAR diproses sistem ini.
 * Perlu ditinjau pemilik bisnis sebelum produksi (lihat docs/PHASE-2-REPORT.md).
 */
export default async function PrivacyPage() {
  const site = await getSite();
  const business = site?.profile.businessName ?? 'Jasa MC Ultah Kak Hari';
  const owner = site?.profile.displayName ?? 'Hari Susanto';
  return (
    <>
      <SiteHeader />
      <main id="konten">
        <Container className="max-w-3xl py-12 sm:py-16">
          <p className="eyebrow">Kebijakan Privasi</p>
          <h1 className="mt-3 font-display text-4xl text-navy-900">Bagaimana data Anda digunakan</h1>
          <div className="mt-8 space-y-8 leading-relaxed text-navy-800 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-navy-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-3 [&_ul]:space-y-1.5">
            <p>
              Situs ini dikelola oleh {owner} ({business}) untuk menerima dan mengelola pemesanan jasa MC. Halaman ini menjelaskan data yang kami kumpulkan
              dan cara penggunaannya.
            </p>
            <section>
              <h2>Data yang dikumpulkan</h2>
              <ul>
                <li>Jika masuk dengan Google: nama, alamat email, foto profil, dan ID akun Google.</li>
                <li>Jika masuk dengan email: alamat email Anda. Kode masuk dikirim ke email tersebut dan hanya disimpan dalam bentuk tersandi selama masa berlakunya.</li>
                <li>Data pemesanan yang Anda isi: nama, email, nomor WhatsApp, detail acara (tanggal, waktu, lokasi, jumlah tamu) dan kebutuhan MC.</li>
                <li>Catatan teknis keamanan: waktu login, alamat IP, dan jenis perangkat/browser, untuk melindungi akun Anda dari penyalahgunaan.</li>
              </ul>
            </section>
            <section>
              <h2>Tujuan penggunaan</h2>
              <ul>
                <li>Memproses, mengonfirmasi, dan menjalankan pesanan jasa MC Anda.</li>
                <li>Menghubungi Anda terkait pesanan (misalnya melalui WhatsApp atau email).</li>
                <li>Menampilkan riwayat dan status pesanan di akun Anda.</li>
                <li>Menjaga keamanan sistem.</li>
              </ul>
              <p className="mt-3">Data Anda tidak dijual dan tidak dibagikan kepada pihak lain untuk keperluan pemasaran.</p>
            </section>
            <section>
              <h2>Siapa yang dapat mengakses</h2>
              <p>
                Data pesanan hanya dapat dilihat oleh Anda sendiri dan oleh {owner} sebagai pengelola. Setiap pelanggan hanya dapat melihat pesanannya
                sendiri.
              </p>
            </section>
            <section>
              <h2>Hak Anda</h2>
              <p>
                Anda dapat memperbarui data profil kapan saja dari halaman Akun, serta meminta salinan atau penghapusan data Anda dengan menghubungi pengelola
                melalui kanal kontak resmi di situs ini.
              </p>
            </section>
          </div>
        </Container>
      </main>
      <SiteFooter profile={site?.profile} />
    </>
  );
}
