'use client';

import clsx from 'clsx';
import { CalendarDays, ClipboardList, ExternalLink, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { logout } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar } from '../site-header';
import { Spinner } from '../ui';
import { ToastProvider } from './feedback';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/pesanan', label: 'Pesanan', icon: ClipboardList },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/admin/pelanggan', label: 'Pelanggan', icon: Users },
  { href: '/admin/pengaturan', label: 'Pengaturan', icon: Settings },
];

/**
 * Kerangka CMS. Guard di sini hanya UX: setiap data CMS berasal dari endpoint /admin/* yang
 * memeriksa role ADMIN di server (AuthGuard memuat ulang user dari database pada setiap request).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace(`/admin/masuk?next=${encodeURIComponent(pathname)}`);
    else if (state.status === 'authenticated' && state.user.role !== 'ADMIN') router.replace('/admin/tidak-diizinkan');
  }, [state, pathname, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (state.status !== 'authenticated' || state.user.role !== 'ADMIN') {
    return (
      <div className="grid min-h-dvh place-items-center bg-cream-50">
        <Spinner label="Memeriksa akses admin…" />
      </div>
    );
  }
  const user = state.user;

  const nav = (
    <nav aria-label="Menu CMS" className="flex flex-col gap-1">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              active ? 'bg-gold-500/15 text-gold-300 ring-1 ring-gold-500/30' : 'text-cream-200/75 hover:bg-white/5 hover:text-cream-50',
            )}
          >
            <n.icon className="size-4.5" aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/admin" className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full border border-gold-400/60 font-display text-[0.95rem] text-gold-300 italic">HS</span>
      <span className="leading-tight">
        <span className="block font-display text-[1.05rem] text-cream-50">Hari Susanto</span>
        <span className="block text-[0.6rem] font-semibold tracking-[0.24em] text-gold-400 uppercase">Studio CMS</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="space-y-1 border-t border-white/10 pt-4">
      <Link href="/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-cream-200/70 hover:bg-white/5 hover:text-cream-50">
        <ExternalLink className="size-4" aria-hidden /> Lihat website
      </Link>
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar name={user.name} url={user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-cream-50">{user.name}</p>
          <p className="truncate text-xs text-cream-200/60">{user.email}</p>
        </div>
        <button onClick={() => logout('/admin/masuk')} className="rounded-lg p-2 text-cream-200/70 hover:bg-white/10 hover:text-gold-300" aria-label="Keluar">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-cream-50 lg:grid lg:grid-cols-[16rem_1fr] lg:bg-[linear-gradient(to_right,var(--color-navy-950)_16rem,var(--color-cream-50)_16rem)]">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-dvh flex-col justify-between bg-navy-950 px-4 py-6 lg:flex">
          <div className="space-y-8">
            <div className="px-2">{brand}</div>
            {nav}
          </div>
          {footer}
        </aside>

        {/* Topbar mobile/tablet */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-navy-950 px-4 lg:hidden">
          {brand}
          <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full text-cream-50" aria-label="Buka menu admin" aria-expanded={open} aria-controls="admin-drawer">
            <Menu className="size-5" />
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu admin">
            <button className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} aria-label="Tutup menu" />
            <div id="admin-drawer" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between bg-navy-950 px-4 py-5">
              <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  {brand}
                  <button onClick={() => setOpen(false)} className="rounded-full p-2 text-cream-50" aria-label="Tutup menu">
                    <X className="size-5" />
                  </button>
                </div>
                {nav}
              </div>
              {footer}
            </div>
          </div>
        )}

        <main id="konten" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-3xl text-navy-900 sm:text-[2.1rem]">{title}</h1>
        {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
