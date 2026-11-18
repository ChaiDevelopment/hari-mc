import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/site-header';
import { Spinner } from '@/components/ui';
import { LoginPanel } from './login-panel';

export const metadata: Metadata = { title: 'Masuk' };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main id="konten" className="flex justify-center px-4 pt-8 pb-16 sm:pt-14">
        <Suspense fallback={<Spinner />}>
          <LoginPanel />
        </Suspense>
      </main>
    </>
  );
}
