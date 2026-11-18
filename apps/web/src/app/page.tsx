import {
  ArrowRight,
  Cake,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  ExternalLink,
  Heart,
  Instagram,
  LogIn,
  MapPin,
  Mic,
  PartyPopper,
  Send,
  Smile,
  Sparkles,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Portrait } from '@/components/brand';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Alert, Container, LinkButton, SectionHeading, buttonClass } from '@/components/ui';
import { formatDuration, formatRupiah } from '@/lib/format';
import { getSite } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'ulang-tahun-anak': Cake,
  'sweet-seventeen': Sparkles,
  gathering: Users,
  'family-event': Heart,
  lomba: Trophy,
  'grand-opening': PartyPopper,
};

/** Kualitas diambil dari deskripsi bisnis yang diberikan pemilik. */
const QUALITIES = [
  { icon: Smile, title: 'Ramah', text: 'Membawa suasana hangat untuk tamu dari segala usia.' },
  { icon: Users, title: 'Interaktif', text: 'Mengajak tamu terlibat sehingga acara terasa hidup.' },
  { icon: Clock, title: 'Tepat waktu', text: 'Menjaga jalannya acara sesuai rundown yang disepakati.' },
  { icon: Sparkles, title: 'Seru & berkesan', text: 'Membuat acara lebih meriah dan diingat semua tamu.' },
];

const STEPS = [
  { icon: LogIn, title: 'Masuk dengan Google', text: 'Tidak perlu membuat kata sandi baru.' },
  { icon: ClipboardList, title: 'Isi detail acara', text: 'Tanggal, lokasi, dan kebutuhan MC Anda.' },
  { icon: Send, title: 'Kirim & dapatkan nomor booking', text: 'Pesanan langsung tercatat di sistem.' },
  { icon: CalendarCheck, title: 'Pantau status', text: 'Lihat perkembangan pesanan dari halaman Akun.' },
];

export default async function HomePage() {
  const site = await getSite();
  const profile = site?.profile ?? null;
  const name = profile?.displayName ?? 'Hari Susanto';

  return (
    <>
      <div className="hero-glow text-cream-50">
        <SiteHeader variant="dark" />
        <section id="konten" className="relative overflow-hidden">
          <Container className="grid items-center gap-12 pt-10 pb-20 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-20 lg:pb-28">
            <div className="animate-fade-up">
              <p className="eyebrow text-gold-400">{profile?.businessName ?? 'Jasa MC Ultah Kak Hari'}</p>
              <h1 className="mt-5 font-display text-[2.35rem] leading-[1.1] text-balance sm:text-5xl lg:text-[3.6rem]">
                Buat Acara Anda Lebih <em className="text-gold-300">Berkesan</em> Bersama MC Profesional
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-cream-200/80 sm:text-lg">
                {profile?.bio ?? 'MC Profesional untuk Berbagai Acara.'}
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <LinkButton href="/pesan" size="lg">
                  Booking Sekarang <ArrowRight className="size-4" aria-hidden />
                </LinkButton>
                <LinkButton href="/#layanan" size="lg" variant="outline-light">
                  Lihat Layanan
                </LinkButton>
              </div>
              {profile?.locationLabel && (
                <p className="mt-8 inline-flex items-center gap-2 text-sm text-cream-200/70">
                  <MapPin className="size-4 text-gold-400" aria-hidden /> {profile.locationLabel}
                </p>
              )}
            </div>
            <div className="animate-fade-up [animation-delay:120ms]">
              <Portrait photoUrl={profile?.photoUrl ?? null} name={name} />
            </div>
          </Container>
        </section>
      </div>

      <main>
        {!site && (
          <Container className="pt-8">
            <Alert tone="error" title="Sebagian konten belum dapat dimuat">
              Server sedang tidak dapat dihubungi. Anda tetap dapat mencoba memesan; muat ulang halaman beberapa saat lagi.
            </Alert>
          </Container>
        )}

        {/* Tentang */}
        <section id="tentang" className="scroll-mt-20 py-20 sm:py-28">
          <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <SectionHeading eyebrow="Tentang" title={`Halo, saya ${name}`}>
              <p>{profile?.bio}</p>
              <p className="mt-4">
                Saya memandu berbagai acara — dari ulang tahun si kecil hingga pembukaan usaha Anda.
              </p>
            </SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              {QUALITIES.map((q) => (
                <div key={q.title} className="rounded-2xl border border-line bg-white p-6 shadow-soft">
                  <q.icon className="size-6 text-gold-600" aria-hidden />
                  <p className="mt-4 font-display text-xl text-navy-900">{q.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{q.text}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Layanan */}
        <section id="layanan" className="scroll-mt-20 bg-cream-100 py-20 sm:py-28">
          <Container>
            <SectionHeading eyebrow="Layanan" title="MC untuk berbagai momen penting" align="center">
              Pilih jenis acara Anda. Kebutuhan detail dapat dijelaskan di formulir pemesanan.
            </SectionHeading>
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(site?.services ?? []).map((s) => {
                const Icon = SERVICE_ICONS[s.slug] ?? Mic;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/pesan?layanan=${s.slug}`}
                      className="group flex h-full items-start gap-4 rounded-2xl border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-lift"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-navy-900 text-gold-300">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="flex-1">
                        <span className="block font-display text-xl text-navy-900">{s.name}</span>
                        {s.description && <span className="mt-1 block text-sm text-muted">{s.description}</span>}
                        {s.packages.length > 0 ? (
                          <span className="mt-2 block text-sm text-muted">
                            {s.packages.length} paket · mulai {formatRupiah(Math.min(...s.packages.map((p) => Number(p.price))))}
                          </span>
                        ) : null}
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold-700 group-hover:text-navy-900">
                          Pesan untuk acara ini <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {(site?.globalPackages.length ?? 0) > 0 && (
              <div className="mt-12 grid gap-4 md:grid-cols-3">
                {site!.globalPackages.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-gold-300 bg-white p-6">
                    <p className="font-display text-xl text-navy-900">{p.name}</p>
                    <p className="mt-1 text-sm text-muted">{formatDuration(p.durationMinutes)}</p>
                    <p className="mt-4 text-2xl font-semibold text-navy-900">{formatRupiah(p.price)}</p>
                    {p.facilities.length > 0 && (
                      <ul className="mt-4 space-y-1.5 text-sm text-muted">
                        {p.facilities.map((f) => (
                          <li key={f}>· {f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
            {site && site.globalPackages.length === 0 && site.services.every((s) => s.packages.length === 0) && (
              <p className="mx-auto mt-10 max-w-xl text-center text-sm text-muted">
                Rincian paket dan biaya disesuaikan dengan kebutuhan acara dan akan dikonfirmasi langsung oleh Hari Susanto setelah pesanan dikirim.
              </p>
            )}
          </Container>
        </section>

        {/* Cara pesan */}
        <section id="cara-pesan" className="scroll-mt-20 py-20 sm:py-28">
          <Container>
            <SectionHeading eyebrow="Cara Pemesanan" title="Pesan dalam beberapa menit" align="center" />
            <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-2xl border border-line bg-white p-6 shadow-soft">
                  <span className="absolute top-5 right-5 font-display text-3xl text-gold-300">{String(i + 1).padStart(2, '0')}</span>
                  <s.icon className="size-6 text-gold-600" aria-hidden />
                  <p className="mt-5 font-semibold text-navy-900">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-12 text-center">
              <LinkButton href="/pesan" size="lg">
                Mulai Pemesanan <ArrowRight className="size-4" aria-hidden />
              </LinkButton>
            </div>
          </Container>
        </section>

        {/* Portfolio, ulasan, Instagram — tautan ke sumber asli; tidak ada konten/rating buatan */}
        <section id="portfolio" className="scroll-mt-20 bg-navy-950 py-20 text-cream-50 sm:py-28">
          <Container>
            <SectionHeading eyebrow="Portfolio & Ulasan" title="Lihat langsung keseruan acaranya" light>
              Dokumentasi acara dan ulasan pelanggan tersedia di kanal resmi Hari Susanto.
            </SectionHeading>
            {(site?.portfolio.length ?? 0) > 0 && (
              <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="portfolio-grid">
                {site!.portfolio.map((p) => (
                  <li key={p.id} className="group overflow-hidden rounded-2xl bg-navy-900 ring-1 ring-cream-50/10">
                    {p.mediaType === 'IMAGE' && p.url ? (
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={p.title ?? 'Dokumentasi acara'} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                        {(p.title || p.caption) && (
                          <figcaption className="px-4 py-3 text-sm">
                            {p.title && <span className="block font-semibold text-cream-50">{p.title}</span>}
                            {p.caption && <span className="mt-0.5 block text-xs text-cream-200/70">{p.caption}</span>}
                          </figcaption>
                        )}
                      </figure>
                    ) : (
                      <a href={p.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-4 text-center text-cream-100 hover:text-gold-300">
                        <ExternalLink className="size-6" aria-hidden />
                        <span className="text-sm font-semibold">{p.title ?? 'Tonton video'}</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              {site?.instagram.profileUrl && (
                <a
                  href={site.instagram.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-cream-50/10 bg-navy-900 p-7 transition hover:border-gold-400/60"
                >
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-navy-950">
                      <Instagram className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-display text-xl">Portfolio di Instagram</p>
                      <p className="text-sm text-cream-200/70">@{site.instagram.handle}</p>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-relaxed text-cream-200/75">Foto dan video dari berbagai acara yang dipandu Hari Susanto.</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300">
                    Buka Instagram <ExternalLink className="size-3.5" aria-hidden />
                  </span>
                </a>
              )}
              {site?.reviews.mapsUrl && (
                <a
                  href={site.reviews.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between rounded-2xl border border-cream-50/10 bg-navy-900 p-7 transition hover:border-gold-400/60"
                >
                  <div className="flex items-center gap-4">
                    <span className="grid size-12 place-items-center rounded-xl bg-cream-50 text-navy-950">
                      <Star className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-display text-xl">Ulasan di Google</p>
                      <p className="text-sm text-cream-200/70">Google Maps</p>
                    </div>
                  </div>
                  <p className="mt-6 text-sm leading-relaxed text-cream-200/75">Baca pengalaman pelanggan secara langsung di profil Google Maps Hari Susanto.</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300">
                    Lihat ulasan <ExternalLink className="size-3.5" aria-hidden />
                  </span>
                </a>
              )}
            </div>
          </Container>
        </section>

        {/* FAQ */}
        {(site?.faq.length ?? 0) > 0 && (
          <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
            <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <SectionHeading eyebrow="FAQ" title="Pertanyaan yang sering ditanyakan" />
              <div className="divide-y divide-line rounded-2xl border border-line bg-white shadow-soft">
                {site!.faq.map((f) => (
                  <details key={f.question} className="group px-6 py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-900 [&::-webkit-details-marker]:hidden">
                      {f.question}
                      <ChevronDown className="size-4 shrink-0 text-gold-600 transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{f.answer}</p>
                  </details>
                ))}
              </div>
            </Container>
          </section>
        )}

        {/* Kontak */}
        <section id="kontak" className="scroll-mt-20 pb-20 sm:pb-28">
          <Container>
            <div className="relative overflow-hidden rounded-[2rem] bg-navy-900 px-6 py-14 text-center text-cream-50 sm:px-12">
              <div className="gold-rule absolute inset-x-12 top-0" aria-hidden />
              <p className="eyebrow text-gold-400">Kontak</p>
              <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl leading-tight sm:text-4xl">Siap membuat acara Anda lebih meriah?</h2>
              <p className="mx-auto mt-4 max-w-xl text-cream-200/75">Kirim detail acara Anda sekarang. Hari Susanto akan meninjau jadwal dan menghubungi Anda.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <LinkButton href="/pesan" size="lg">
                  Booking Sekarang
                </LinkButton>
                {profile?.whatsappNumber && (
                  <a href={`https://wa.me/${profile.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className={buttonClass('outline-light', 'lg')}>
                    WhatsApp
                  </a>
                )}
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-cream-200/75">
                {profile?.locationLabel && (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="size-4 text-gold-400" aria-hidden /> {profile.locationLabel}
                  </span>
                )}
                {profile?.instagramUrl && (
                  <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-gold-300">
                    <Instagram className="size-4 text-gold-400" aria-hidden /> @{profile.instagramHandle}
                  </a>
                )}
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter profile={profile} />
    </>
  );
}
