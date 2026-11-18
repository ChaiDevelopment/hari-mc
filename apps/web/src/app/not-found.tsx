import { SiteHeader } from '@/components/site-header';
import { Container, LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="konten">
        <Container className="flex min-h-[60dvh] flex-col items-center justify-center py-20 text-center">
          <p className="font-display text-7xl text-gold-500">404</p>
          <h1 className="mt-4 font-display text-3xl text-navy-900">Halaman tidak ditemukan</h1>
          <p className="mt-3 text-muted">Halaman yang Anda cari tidak tersedia.</p>
          <LinkButton href="/" className="mt-8">
            Kembali ke beranda
          </LinkButton>
        </Container>
      </main>
    </>
  );
}
