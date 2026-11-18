import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';

export const metadata: Metadata = { title: { default: 'CMS', template: '%s · CMS Hari Susanto' }, robots: { index: false, follow: false } };

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
