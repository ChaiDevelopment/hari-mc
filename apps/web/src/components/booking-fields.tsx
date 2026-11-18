'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { extraKey, isRequired, type Draft, type DraftValue } from '@/lib/booking-form';
import { formatDuration, formatRupiah } from '@/lib/format';
import type { ExtraQuestion, FormFieldConfig, Package, Service } from '@/lib/types';

interface Ctx {
  draft: Draft;
  errors: Record<string, string>;
  set: (key: string, value: DraftValue) => void;
  services: Service[];
  packages: Package[];
  timezones: Array<{ id: string; label: string }>;
  minDate: string;
  maxDate: string;
}

const AUTOCOMPLETE: Record<string, string> = { contactName: 'name', contactEmail: 'email', contactWhatsapp: 'tel', city: 'address-level2', address: 'street-address' };
const PLACEHOLDER: Record<string, string> = {
  contactWhatsapp: '081234567890',
  eventName: 'Contoh: Ulang Tahun Alya ke-7',
  venueName: 'Contoh: Ballroom Hotel / Rumah',
  mapsUrl: 'https://maps.app.goo.gl/…',
  guestCount: 'Contoh: 50',
  dressCode: 'Contoh: Batik / Smart casual',
};
const WIDE = new Set(['textarea', 'service', 'package']);

function Shell({ id, label, required, error, help, wide, children }: { id: string; label: string; required: boolean; error?: string; help?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={clsx(wide && 'sm:col-span-2')}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1 text-sm font-semibold text-navy-900">
        {label}
        {required ? <span className="text-gold-600" aria-hidden>*</span> : <span className="text-xs font-normal text-muted">(opsional)</span>}
      </label>
      {children}
      {help && !error && <p className="mt-1.5 text-xs text-muted">{help}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CoreField({ field, ctx }: { field: FormFieldConfig; ctx: Ctx }) {
  const id = `f-${field.key}`;
  const value = ctx.draft[field.key];
  const v = typeof value === 'string' ? value : '';
  const error = ctx.errors[field.key];
  const required = isRequired(field);
  const common = {
    id,
    name: field.key,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-required': required || undefined,
  } as const;

  let control: ReactNode;
  switch (field.type) {
    case 'textarea':
      control = <textarea {...common} className="field-input min-h-28" maxLength={5000} value={v} onChange={(e) => ctx.set(field.key, e.target.value)} placeholder={PLACEHOLDER[field.key]} autoComplete={AUTOCOMPLETE[field.key]} />;
      break;
    case 'date':
      control = <input {...common} type="date" className="field-input" min={ctx.minDate} max={ctx.maxDate} value={v} onChange={(e) => ctx.set(field.key, e.target.value)} />;
      break;
    case 'time':
      control = <input {...common} type="time" step={300} className="field-input" value={v} onChange={(e) => ctx.set(field.key, e.target.value)} />;
      break;
    case 'timezone':
      control = (
        <select {...common} className="field-input" value={v || 'Asia/Jakarta'} onChange={(e) => ctx.set(field.key, e.target.value)}>
          {ctx.timezones.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} ({t.id.replace('Asia/', '')})
            </option>
          ))}
        </select>
      );
      break;
    case 'select':
      control = (
        <select {...common} className="field-input" value={v} onChange={(e) => ctx.set(field.key, e.target.value)}>
          <option value="">Pilih…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'service':
      control = (
        <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2" id={id}>
          {ctx.services.map((s) => (
            <ChoiceCard key={s.id} name={field.key} checked={v === s.id} onSelect={() => ctx.set(field.key, s.id)} title={s.name} invalid={!!error} />
          ))}
        </div>
      );
      break;
    case 'package':
      control = (
        <div role="radiogroup" className="grid gap-2" id={id}>
          <ChoiceCard name={field.key} checked={!v} onSelect={() => ctx.set(field.key, '')} title="Belum memilih paket" subtitle="Rincian biaya akan dikonfirmasi oleh Hari Susanto." />
          {ctx.packages.map((p) => (
            <ChoiceCard
              key={p.id}
              name={field.key}
              checked={v === p.id}
              onSelect={() => ctx.set(field.key, p.id)}
              title={p.name}
              subtitle={`${formatDuration(p.durationMinutes)}${p.description ? ` · ${p.description}` : ''}`}
              aside={formatRupiah(p.price)}
            />
          ))}
        </div>
      );
      break;
    default: {
      const type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
      const inputMode = field.type === 'phone' ? 'tel' : field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : undefined;
      control = (
        <input
          {...common}
          type={type}
          inputMode={inputMode}
          className="field-input"
          value={v}
          maxLength={field.type === 'url' ? 500 : 200}
          onChange={(e) => ctx.set(field.key, e.target.value)}
          placeholder={PLACEHOLDER[field.key]}
          autoComplete={AUTOCOMPLETE[field.key]}
        />
      );
    }
  }

  return (
    <Shell id={id} label={field.label} required={required} error={error} help={field.helpText} wide={WIDE.has(field.type) || field.key === 'eventName'}>
      {control}
    </Shell>
  );
}

export function ExtraField({ q, ctx }: { q: ExtraQuestion; ctx: Ctx }) {
  const key = extraKey(q.key);
  const id = `f-${key.replace('.', '-')}`;
  const value = ctx.draft[key];
  const error = ctx.errors[key];
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : undefined } as const;
  const v = typeof value === 'string' ? value : '';

  if (q.type === 'checkbox') {
    return (
      <div className="sm:col-span-2">
        <label className="flex items-start gap-3 text-sm text-navy-900">
          <input {...common} type="checkbox" className="mt-0.5 size-4 accent-gold-600" checked={value === true} onChange={(e) => ctx.set(key, e.target.checked)} />
          <span>
            {q.label} {q.required && <span className="text-gold-600">*</span>}
          </span>
        </label>
        {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">{error}</p>}
      </div>
    );
  }
  let control: ReactNode;
  if (q.type === 'textarea') control = <textarea {...common} className="field-input min-h-24" maxLength={2000} value={v} onChange={(e) => ctx.set(key, e.target.value)} />;
  else if (q.type === 'select')
    control = (
      <select {...common} className="field-input" value={v} onChange={(e) => ctx.set(key, e.target.value)}>
        <option value="">Pilih…</option>
        {(q.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else control = <input {...common} className="field-input" type={q.type === 'date' ? 'date' : 'text'} inputMode={q.type === 'number' ? 'numeric' : undefined} value={v} onChange={(e) => ctx.set(key, e.target.value)} />;
  return (
    <Shell id={id} label={q.label} required={!!q.required} error={error} help={q.helpText} wide={q.type === 'textarea'}>
      {control}
    </Shell>
  );
}

function ChoiceCard({ name, checked, onSelect, title, subtitle, aside, invalid }: { name: string; checked: boolean; onSelect: () => void; title: string; subtitle?: string; aside?: string; invalid?: boolean }) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3.5 transition',
        checked ? 'border-gold-500 ring-4 ring-gold-300/40' : invalid ? 'border-rose-300' : 'border-line hover:border-gold-400',
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onSelect} />
      <span className={clsx('grid size-5 shrink-0 place-items-center rounded-full border', checked ? 'border-gold-600 bg-gold-500 text-navy-950' : 'border-cream-300')} aria-hidden>
        {checked && <Check className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-navy-900">{title}</span>
        {subtitle && <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>}
      </span>
      {aside && <span className="text-sm font-semibold text-navy-900">{aside}</span>}
    </label>
  );
}

export type FieldCtx = Ctx;
