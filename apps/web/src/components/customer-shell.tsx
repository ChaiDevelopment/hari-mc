'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useRequireCustomer } from '@/lib/auth';
import { SiteHeader } from './site-header';
import { Alert, Container, Spinner } from './ui';

const TABS = [
  { href: '/akun', label: 'Ringkasan', exact: true },
  { href: '/akun/pesanan', label: 'Pesanan Saya' },
  { href: '/akun/profil', label: 'Profil' },
];

/** Kerangka halaman khusus customer yang sudah login. */
export function CustomerShell({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  const user = useRequireCustomer();
  const pathname = usePathname();

  return (
    <>
      <SiteHeader />
      <main id="konten" className="min-h-[calc(100dvh-4.5rem)] pb-20">
        {!user ? (
          <Spinner label="Memeriksa sesi…" />
        ) : user.role !== 'CUSTOMER' ? (
          <Container className="py-16">
            <Alert title="Anda masuk sebagai admin">
              Halaman ini khusus pelanggan.{' '}
              <Link href="/admin" className="font-semibold underline">
                Buka CMS admin
              </Link>
            </Alert>
          </Container>
        ) : (
          <>
            {tabs && (
              <div className="border-b border-line bg-cream-50">
                <Container>
                  <nav aria-label="Menu akun" className="-mb-px flex gap-6 overflow-x-auto">
                    {TABS.map((t) => {
                      const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          aria-current={active ? 'page' : undefined}
                          className={clsx(
                            'border-b-2 py-4 text-sm font-semibold whitespace-nowrap transition',
                            active ? 'border-gold-500 text-navy-900' : 'border-transparent text-muted hover:text-navy-900',
                          )}
                        >
                          {t.label}
                        </Link>
                      );
                    })}
                  </nav>
                </Container>
              </div>
            )}
            {children}
          </>
        )}
      </main>
    </>
  );
}
