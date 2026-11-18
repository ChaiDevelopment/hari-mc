import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { Spinner } from '@/components/ui';
import { BookingWizard } from './booking-wizard';

export const metadata: Metadata = { title: 'Booking Sekarang' };

export default function BookingPage() {
  return (
    <CustomerShell tabs={false}>
      <Suspense fallback={<Spinner />}>
        <BookingWizard />
      </Suspense>
    </CustomerShell>
  );
}
