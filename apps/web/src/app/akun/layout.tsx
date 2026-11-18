import type { Metadata } from 'next';
import { CustomerShell } from '@/components/customer-shell';

export const metadata: Metadata = { title: 'Akun Saya' };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
