'use client';

import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui';

// ───────────── Toast ─────────────

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}
const ToastCtx = createContext<(tone: Tone, message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: Tone, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end">
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              data-testid="toast"
              className={clsx(
                'animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lift ring-1',
                t.tone === 'success' && 'bg-navy-900 text-cream-50 ring-gold-500/40',
                t.tone === 'error' && 'bg-rose-50 text-rose-900 ring-rose-200',
                t.tone === 'info' && 'bg-white text-navy-900 ring-line',
              )}
            >
              <Icon className={clsx('mt-0.5 size-4 shrink-0', t.tone === 'success' && 'text-gold-400')} aria-hidden />
              <span className="flex-1 leading-relaxed">{t.message}</span>
              <button onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Tutup notifikasi" className="opacity-60 hover:opacity-100">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ───────────── Dialog konfirmasi ─────────────

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  /** Jika diisi, dialog menampilkan textarea wajib (mis. alasan penolakan). */
  input?: { label: string; placeholder?: string; minLength?: number; required?: boolean };
  onConfirm: (input: string) => Promise<void>;
}

export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (options && !d.open) {
      setValue('');
      setError(null);
      d.showModal();
    } else if (!options && d.open) d.close();
  }, [options]);

  if (!options) return <dialog ref={ref} className="hidden" />;
  const min = options.input?.minLength ?? 0;
  const invalid = !!options.input && (options.input.required ?? true) && value.trim().length < Math.max(min, 1);

  const submit = async () => {
    if (invalid) return setError(`${options.input!.label} minimal ${Math.max(min, 1)} karakter`);
    setBusy(true);
    setError(null);
    try {
      await options.onConfirm(value.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-white p-0 shadow-lift backdrop:bg-navy-950/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          {options.tone === 'danger' && (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-display text-xl text-navy-900">
              {options.title}
            </h2>
            {options.description && <div className="mt-2 text-sm leading-relaxed text-muted">{options.description}</div>}
          </div>
        </div>
        {options.input && (
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-navy-900">{options.input.label}</span>
            <textarea
              className="field-input mt-1.5 min-h-24"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={options.input.placeholder}
              maxLength={1000}
              aria-invalid={error ? true : undefined}
              autoFocus
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button variant={options.tone === 'danger' ? 'danger' : 'navy'} onClick={submit} loading={busy} data-testid="confirm-action">
            {options.confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  return { confirm: setOptions, dialog: <ConfirmDialog options={options} onClose={() => setOptions(null)} /> };
}

export function StatCard({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'gold' | 'navy'; icon?: ReactNode }) {
  return (
    <div
      className={clsx(
        'rounded-2xl border p-5',
        tone === 'navy' ? 'border-navy-800 bg-navy-900 text-cream-50' : tone === 'gold' ? 'border-gold-300 bg-gold-200/40' : 'border-line bg-white shadow-soft',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={clsx('text-xs font-semibold tracking-wide uppercase', tone === 'navy' ? 'text-gold-300' : 'text-muted')}>{label}</p>
        {icon && <span className={tone === 'navy' ? 'text-gold-400' : 'text-gold-600'}>{icon}</span>}
      </div>
      <p className={clsx('mt-2 font-display text-3xl', tone === 'navy' ? 'text-cream-50' : 'text-navy-900')}>{value}</p>
      {hint && <p className={clsx('mt-1 text-xs', tone === 'navy' ? 'text-cream-200/70' : 'text-muted')}>{hint}</p>}
    </div>
  );
}
