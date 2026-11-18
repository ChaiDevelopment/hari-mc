'use client';

import { ShieldX } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui';
import { logout } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function UnauthorizedPage() {
  const { state } = useAuth();
  return (
    <main id="konten" className="flex min-h-dvh items-center justify-center bg-cream-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-soft">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-rose-50 text-rose-600">
          <ShieldX className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-3xl text-navy-900">Akses ditolak</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {state.status === 'authenticated' ? (
            <>
              Akun <strong className="text-navy-900">{state.user.email}</strong> bukan admin. Panel ini khusus Hari Susanto.
            </>
          ) : (
            'Panel ini khusus Hari Susanto.'
          )}
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {state.status === 'authenticated' && (
            <Button variant="navy" onClick={() => logout('/admin/masuk')}>
              Keluar & ganti akun
            </Button>
          )}
          <LinkButton href="/" variant="outline">
            Ke website
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
