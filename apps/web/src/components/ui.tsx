import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { STATUS_META, type StatusTone } from '@/lib/format';
import type { BookingStatus } from '@/lib/types';

type Variant = 'gold' | 'navy' | 'outline' | 'ghost' | 'outline-light' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 select-none whitespace-nowrap';
const variants: Record<Variant, string> = {
  gold: 'bg-gold-500 text-navy-950 shadow-[0_8px_20px_-10px_rgb(194_159_95/0.9)] hover:bg-gold-400 active:bg-gold-600',
  navy: 'bg-navy-900 text-cream-50 hover:bg-navy-800 active:bg-navy-950',
  outline: 'border border-navy-900/15 bg-white text-navy-900 hover:border-gold-500 hover:text-navy-950',
  'outline-light': 'border border-cream-50/25 text-cream-50 hover:border-gold-400 hover:text-gold-300',
  ghost: 'text-navy-800 hover:bg-cream-200/60',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[0.95rem]',
  lg: 'h-13 px-7 text-base',
};

export function buttonClass(variant: Variant = 'gold', size: Size = 'md', className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = 'gold',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = 'gold',
  size = 'md',
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={clsx('rounded-2xl border border-line bg-white shadow-soft', className)} {...rest}>
      {children}
    </div>
  );
}

const TONES: Record<StatusTone, string> = {
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  navy: 'bg-navy-900 text-cream-50 ring-navy-900',
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      data-testid="status-badge"
      className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset', TONES[meta.tone], className)}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {meta.label}
    </span>
  );
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
      <Loader2 className="size-5 animate-spin text-gold-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'error' | 'success'; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  const styles = {
    info: 'border-gold-300/70 bg-gold-200/30 text-navy-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-xl border px-4 py-3 text-sm', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-cream-300 bg-cream-100/50 px-6 py-12 text-center">
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-white text-gold-600 shadow-soft">{icon}</div>}
      <p className="font-display text-xl text-navy-900">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, children, align = 'left', light }: { eyebrow?: string; title: string; children?: ReactNode; align?: 'left' | 'center'; light?: boolean }) {
  return (
    <div className={clsx('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && <p className={clsx('eyebrow', light && 'text-gold-400')}>{eyebrow}</p>}
      <h2 className={clsx('mt-3 font-display text-3xl leading-tight sm:text-4xl', light ? 'text-cream-50' : 'text-navy-900')}>{title}</h2>
      {children && <div className={clsx('mt-4 text-base leading-relaxed', light ? 'text-cream-200/80' : 'text-muted')}>{children}</div>}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}
