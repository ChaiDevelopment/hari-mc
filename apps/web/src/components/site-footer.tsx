import { Instagram, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { McProfile } from '@/lib/types';
import { Logo } from './brand';

export function SiteFooter({ profile }: { profile?: McProfile | null }) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy-950 text-cream-200/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Logo light />
          <p className="mt-5 max-w-sm text-sm leading-relaxed">
            {profile?.tagline ?? 'MC Profesional untuk Berbagai Acara'}
            {profile?.locationLabel ? ` · ${profile.locationLabel}` : ''}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-gold-400 uppercase">Menu</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link className="hover:text-gold-300" href="/#layanan">Layanan</Link></li>
            <li><Link className="hover:text-gold-300" href="/pesan">Booking Sekarang</Link></li>
            <li><Link className="hover:text-gold-300" href="/akun">Akun Saya</Link></li>
            <li><Link className="hover:text-gold-300" href="/kebijakan-privasi">Kebijakan Privasi</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-gold-400 uppercase">Temukan Kami</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {profile?.instagramUrl && (
              <li>
                <a className="inline-flex items-center gap-2 hover:text-gold-300" href={profile.instagramUrl} target="_blank" rel="noopener noreferrer">
                  <Instagram className="size-4" aria-hidden /> @{profile.instagramHandle}
                </a>
              </li>
            )}
            {profile?.googleMapsUrl && (
              <li>
                <a className="inline-flex items-center gap-2 hover:text-gold-300" href={profile.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="size-4" aria-hidden /> Google Maps
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-cream-50/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-cream-200/50 sm:px-6 lg:px-8">
          © {year} {profile?.businessName ?? 'Jasa MC Ultah Kak Hari'} — {profile?.displayName ?? 'Hari Susanto'}
        </p>
      </div>
    </footer>
  );
}
