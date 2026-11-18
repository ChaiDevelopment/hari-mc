'use client';

import clsx from 'clsx';
import { CalendarCheck, LogOut, Menu, User, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { firstName } from '@/lib/format';
import { Logo } from './brand';
import { buttonClass } from './ui';

const NAV = [
  { href: '/#tentang', label: 'Tentang' },
  { href: '/#layanan', label: 'Layanan' },
  { href: '/#cara-pesan', label: 'Cara Pesan' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#kontak', label: 'Kontak' },
];

export function SiteHeader({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { state, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const dark = variant === 'dark' && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const handleLogout = () => logout();

  const user = state.status === 'authenticated' ? state.user : null;

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 transition-colors duration-300',
        dark ? 'bg-transparent' : 'border-b border-line/80 bg-cream-50/90 backdrop-blur supports-[backdrop-filter]:bg-cream-50/75',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.5rem] sm:px-6 lg:px-8">
        <Logo light={dark} />

        <nav aria-label="Navigasi utama" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx('rounded-full px-3 py-2 text-sm font-medium transition', dark ? 'text-cream-100/80 hover:text-gold-300' : 'text-navy-800/80 hover:text-navy-950')}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {state.status === 'loading' ? (
            <span className="h-9 w-24 animate-pulse rounded-full bg-cream-200/40" aria-hidden />
          ) : user ? (
            <>
              <Link href="/akun" className={clsx('flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition', dark ? 'text-cream-50 hover:bg-white/10' : 'text-navy-900 hover:bg-cream-200/60')}>
                <Avatar name={user.name} url={user.avatarUrl} />
                {firstName(user.name)}
              </Link>
              <button onClick={handleLogout} className={clsx('rounded-full p-2 transition', dark ? 'text-cream-100/70 hover:text-gold-300' : 'text-muted hover:text-navy-900')} aria-label="Keluar">
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <Link href="/masuk" className={clsx('px-3 py-2 text-sm font-semibold', dark ? 'text-cream-50 hover:text-gold-300' : 'text-navy-900 hover:text-gold-700')}>
              Masuk
            </Link>
          )}
          <Link href="/pesan" className={buttonClass('gold', 'sm')}>
            <CalendarCheck className="size-4" aria-hidden />
            Booking Sekarang
          </Link>
        </div>

        <button
          type="button"
          className={clsx('grid size-10 place-items-center rounded-full lg:hidden', dark ? 'text-cream-50' : 'text-navy-900')}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-cream-50 lg:hidden">
          <nav aria-label="Navigasi seluler" className="mx-auto flex max-w-6xl flex-col px-4 py-3 sm:px-6">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-3 text-[0.95rem] font-medium text-navy-900 hover:bg-cream-200/60">
                {n.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-line" />
            {user ? (
              <>
                <Link href="/akun" className="flex items-center gap-3 rounded-lg px-2 py-3 font-medium text-navy-900 hover:bg-cream-200/60">
                  <User className="size-4 text-gold-600" /> Akun Saya
                </Link>
                <button onClick={handleLogout} className="flex items-center gap-3 rounded-lg px-2 py-3 text-left font-medium text-navy-900 hover:bg-cream-200/60">
                  <LogOut className="size-4 text-gold-600" /> Keluar
                </button>
              </>
            ) : (
              <Link href="/masuk" className="rounded-lg px-2 py-3 font-medium text-navy-900 hover:bg-cream-200/60">
                Masuk
              </Link>
            )}
            <Link href="/pesan" className={buttonClass('gold', 'md', 'mt-2 mb-2')}>
              <CalendarCheck className="size-4" aria-hidden />
              Booking Sekarang
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export function Avatar({ name, url, size = 'sm' }: { name: string; url: string | null; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'size-14 text-lg' : 'size-8 text-xs';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" referrerPolicy="no-referrer" className={clsx(cls, 'rounded-full object-cover ring-2 ring-gold-300/60')} />;
  }
  return (
    <span className={clsx(cls, 'grid place-items-center rounded-full bg-navy-800 font-semibold text-gold-300 ring-2 ring-gold-300/60')} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
