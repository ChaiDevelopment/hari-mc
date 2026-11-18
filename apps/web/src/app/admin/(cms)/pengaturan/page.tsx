'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Plus, Trash2, Upload, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PageHeader } from '@/components/admin/admin-shell';
import { useConfirm, useToast } from '@/components/admin/feedback';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { api, ApiError, apiUpload } from '@/lib/api';
import type { AdminPackage, AdminService, AdminSettings, PortfolioItem } from '@/lib/admin-types';
import { formatDateTime, formatDuration, formatRupiah } from '@/lib/format';

const TABS = [
  { id: 'profil', label: 'Profil & Kontak' },
  { id: 'layanan', label: 'Layanan & Paket' },
  { id: 'pembayaran', label: 'DP & Transportasi' },
  { id: 'jadwal', label: 'Aturan Jadwal' },
  { id: 'portfolio', label: 'Portfolio' },
] as const;
type TabId = (typeof TABS)[number]['id'];

type Errors = Record<string, string>;
const errorsOf = (e: unknown): Errors => {
  if (e instanceof ApiError) {
    if (e.errors.length) return Object.fromEntries(e.errors.map((x) => [x.field, x.message]));
    return { _: e.message };
  }
  return { _: 'Gagal menyimpan' };
};

function Field({ label, error, hint, children, wide }: { label: string; error?: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={clsx('block', wide && 'sm:col-span-2')}>
      <span className="text-sm font-semibold text-navy-900">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-700" role="alert">{error}</span>}
    </label>
  );
}

function Unset({ children = 'Belum dikonfigurasi' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{children}</span>;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profil');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<AdminSettings>('/admin/settings')
      .then(setSettings)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Gagal memuat pengaturan'));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const h = window.location.hash.slice(1) as TabId;
    if (TABS.some((t) => t.id === h)) setTab(h);
  }, []);

  return (
    <>
      <PageHeader eyebrow="Pengaturan" title="Pengaturan bisnis">
        Semua perubahan langsung tersimpan ke database dan tercatat di audit log.
      </PageHeader>
      <div role="tablist" aria-label="Bagian pengaturan" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              history.replaceState(null, '', `#${t.id}`);
            }}
            className={clsx('shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition', tab === t.id ? 'border-navy-900 bg-navy-900 text-cream-50' : 'border-line bg-white text-navy-800 hover:border-gold-400')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!settings && !error && <Spinner />}
      {settings && (
        <>
          {tab === 'profil' && (
            <div className="space-y-6">
              <ProfileTab s={settings} onSaved={load} />
              <GoogleReviewsCard s={settings} onSaved={load} />
            </div>
          )}
          {tab === 'layanan' && <ServicesTab />}
          {tab === 'pembayaran' && <PaymentTab s={settings} onSaved={load} />}
          {tab === 'jadwal' && <RulesTab s={settings} onSaved={load} />}
          {tab === 'portfolio' && <PortfolioTab />}
        </>
      )}
    </>
  );
}

// ───────────── Profil ─────────────

function ProfileTab({ s, onSaved }: { s: AdminSettings; onSaved: () => void }) {
  const p = s.profile;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    displayName: p.displayName,
    businessName: p.businessName,
    tagline: p.tagline ?? '',
    bio: p.bio ?? '',
    locationLabel: p.locationLabel ?? '',
    instagramUrl: p.instagramUrl ?? '',
    instagramHandle: p.instagramHandle ?? '',
    googleMapsUrl: p.googleMapsUrl ?? '',
    whatsappNumber: p.whatsappNumber ? `0${p.whatsappNumber.slice(3)}` : '',
    contactEmail: p.contactEmail ?? '',
    photoUrl: p.photoUrl ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const r = await apiUpload<{ url: string }>('/admin/media', file);
      setF((x) => ({ ...x, photoUrl: r.url }));
      toast('info', 'Foto terunggah. Klik Simpan untuk memakainya.');
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Gagal mengunggah');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api('/admin/settings/profile', { method: 'PATCH', body: f });
      toast('success', 'Profil disimpan dan tampil di website');
      onSaved();
    } catch (err) {
      setErrors(errorsOf(err));
      toast('error', 'Periksa kembali isian profil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[18rem_1fr]" data-testid="profile-form">
      <Card className="h-fit p-6">
        <p className="text-sm font-semibold text-navy-900">Foto profil</p>
        <div className="mt-3 aspect-[4/5] overflow-hidden rounded-2xl bg-navy-900">
          {f.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.photoUrl} alt="Foto profil" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-cream-200/70">
              Belum ada foto. Website menampilkan monogram “HS”.
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="photo" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden /> Unggah
          </Button>
          {f.photoUrl && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setF({ ...f, photoUrl: '' })}>
              Hapus
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">JPG, PNG, atau WEBP · maks. 5 MB</p>
        {errors.photoUrl && <p className="mt-1 text-xs text-rose-700">{errors.photoUrl}</p>}
      </Card>
      <Card className="p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nama MC" error={errors.displayName}>
            <input className="field-input" value={f.displayName} onChange={set('displayName')} required minLength={2} />
          </Field>
          <Field label="Nama bisnis" error={errors.businessName}>
            <input className="field-input" value={f.businessName} onChange={set('businessName')} required minLength={2} />
          </Field>
          <Field label="Tagline" error={errors.tagline} wide>
            <input className="field-input" value={f.tagline} onChange={set('tagline')} maxLength={200} />
          </Field>
          <Field label="Deskripsi" error={errors.bio} wide>
            <textarea className="field-input min-h-28" value={f.bio} onChange={set('bio')} maxLength={2000} />
          </Field>
          <Field label="Lokasi" error={errors.locationLabel}>
            <input className="field-input" value={f.locationLabel} onChange={set('locationLabel')} />
          </Field>
          <Field label="Nomor WhatsApp bisnis" error={errors.whatsappNumber} hint={f.whatsappNumber ? undefined : 'Belum diisi — tombol WhatsApp di website disembunyikan'}>
            <input className="field-input" inputMode="tel" placeholder="08xxxxxxxxxx" value={f.whatsappNumber} onChange={set('whatsappNumber')} name="whatsappNumber" />
          </Field>
          <Field label="Email kontak" error={errors.contactEmail}>
            <input className="field-input" type="email" value={f.contactEmail} onChange={set('contactEmail')} />
          </Field>
          <Field label="Username Instagram" error={errors.instagramHandle}>
            <input className="field-input" value={f.instagramHandle} onChange={set('instagramHandle')} />
          </Field>
          <Field label="URL Instagram" error={errors.instagramUrl}>
            <input className="field-input" type="url" value={f.instagramUrl} onChange={set('instagramUrl')} />
          </Field>
          <Field label="URL Google Maps" error={errors.googleMapsUrl}>
            <input className="field-input" type="url" value={f.googleMapsUrl} onChange={set('googleMapsUrl')} />
          </Field>
        </div>
        {errors._ && <Alert tone="error" className="mt-4">{errors._}</Alert>}
        <div className="mt-6 flex justify-end border-t border-line pt-5">
          <Button type="submit" variant="navy" loading={saving}>
            Simpan profil
          </Button>
        </div>
      </Card>
    </form>
  );
}

// ───────────── Layanan & paket ─────────────

const emptyPkg = { id: '', serviceId: '', name: '', description: '', durationMinutes: '120', price: '', facilities: '', isActive: true };

function ServicesTab() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [services, setServices] = useState<AdminService[] | null>(null);
  const [packages, setPackages] = useState<AdminPackage[] | null>(null);
  const [newService, setNewService] = useState('');
  const [pkg, setPkg] = useState<typeof emptyPkg | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([api<AdminService[]>('/admin/services'), api<AdminPackage[]>('/admin/packages')]);
    setServices(s);
    setPackages(p);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const addService = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/admin/services', { method: 'POST', body: { name: newService } });
      setNewService('');
      toast('success', 'Kategori ditambahkan');
      await load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Gagal');
    }
  };

  const toggleService = async (s: AdminService) => {
    await api(`/admin/services/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } });
    toast('success', s.isActive ? `“${s.name}” disembunyikan dari website` : `“${s.name}” ditampilkan`);
    await load();
  };

  const savePkg = async (e: FormEvent) => {
    e.preventDefault();
    if (!pkg) return;
    setSaving(true);
    setErrors({});
    const body = {
      serviceId: pkg.serviceId || null,
      name: pkg.name,
      description: pkg.description,
      durationMinutes: Number(pkg.durationMinutes),
      price: Number(pkg.price.replace(/\D/g, '')),
      facilities: pkg.facilities.split('\n').map((x) => x.trim()).filter(Boolean),
      isActive: pkg.isActive,
    };
    try {
      if (pkg.id) await api(`/admin/packages/${pkg.id}`, { method: 'PATCH', body });
      else await api('/admin/packages', { method: 'POST', body });
      toast('success', pkg.id ? 'Paket diperbarui' : 'Paket ditambahkan dan tampil di website');
      setPkg(null);
      await load();
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setSaving(false);
    }
  };

  const archive = (p: AdminPackage) =>
    confirm({
      title: `Arsipkan paket “${p.name}”?`,
      description: 'Paket tidak tampil lagi di website. Pesanan lama tetap menyimpan harga saat dipesan.',
      confirmLabel: 'Arsipkan',
      tone: 'danger',
      onConfirm: async () => {
        await api(`/admin/packages/${p.id}`, { method: 'DELETE' });
        toast('success', 'Paket diarsipkan');
        await load();
      },
    });

  if (!services || !packages) return <Spinner />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      {dialog}
      <Card className="h-fit p-6">
        <h2 className="font-display text-xl text-navy-900">Kategori layanan</h2>
        <ul className="mt-4 divide-y divide-line">
          {services.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={clsx('font-medium', s.isActive ? 'text-navy-900' : 'text-muted line-through')}>{s.name}</p>
                <p className="text-xs text-muted">
                  {s._count.bookings} pesanan · {s._count.packages} paket
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void toggleService(s)} aria-label={s.isActive ? `Sembunyikan ${s.name}` : `Tampilkan ${s.name}`}>
                {s.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={addService} className="mt-4 flex gap-2">
          <input className="field-input" placeholder="Kategori baru" value={newService} onChange={(e) => setNewService(e.target.value)} minLength={2} maxLength={80} required aria-label="Nama kategori baru" />
          <Button type="submit" variant="navy" size="md">
            <Plus className="size-4" aria-hidden />
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-navy-900">Paket & harga</h2>
          {!pkg && (
            <Button size="sm" variant="navy" onClick={() => setPkg({ ...emptyPkg })} data-testid="add-package">
              <Plus className="size-4" aria-hidden /> Paket baru
            </Button>
          )}
        </div>
        {packages.length === 0 && !pkg && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <Unset>Belum ada paket</Unset>
            <p className="mt-2">Selama belum ada paket, pelanggan melihat “biaya dikonfirmasi oleh Hari Susanto”. Harga hanya tampil setelah Anda menambahkannya di sini.</p>
          </div>
        )}
        {pkg && (
          <form onSubmit={savePkg} className="mt-4 grid gap-4 rounded-xl border border-gold-300 bg-cream-50 p-4 sm:grid-cols-2" data-testid="package-form">
            <Field label="Nama paket" error={errors.name}>
              <input className="field-input" value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} required minLength={2} name="name" />
            </Field>
            <Field label="Kategori" error={errors.serviceId}>
              <select className="field-input" value={pkg.serviceId} onChange={(e) => setPkg({ ...pkg, serviceId: e.target.value })} name="serviceId">
                <option value="">Semua kategori</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Harga (Rp)" error={errors.price}>
              <input className="field-input" inputMode="numeric" value={pkg.price} onChange={(e) => setPkg({ ...pkg, price: e.target.value.replace(/\D/g, '') })} required name="price" />
            </Field>
            <Field label="Durasi (menit)" error={errors.durationMinutes}>
              <input className="field-input" type="number" min={15} max={1440} step={15} value={pkg.durationMinutes} onChange={(e) => setPkg({ ...pkg, durationMinutes: e.target.value })} required name="durationMinutes" />
            </Field>
            <Field label="Deskripsi" error={errors.description} wide>
              <textarea className="field-input min-h-20" value={pkg.description} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} maxLength={1000} />
            </Field>
            <Field label="Fasilitas (satu per baris)" error={errors.facilities} wide>
              <textarea className="field-input min-h-20" value={pkg.facilities} onChange={(e) => setPkg({ ...pkg, facilities: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-navy-900 sm:col-span-2">
              <input type="checkbox" className="size-4 accent-gold-600" checked={pkg.isActive} onChange={(e) => setPkg({ ...pkg, isActive: e.target.checked })} /> Tampilkan di website
            </label>
            {errors._ && <Alert tone="error" className="sm:col-span-2">{errors._}</Alert>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setPkg(null)}>
                Batal
              </Button>
              <Button type="submit" variant="navy" loading={saving}>
                Simpan paket
              </Button>
            </div>
          </form>
        )}
        {packages.length > 0 && (
          <ul className="mt-4 space-y-3" data-testid="package-list">
            {packages.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">
                    {p.name} {!p.isActive && <span className="text-xs font-normal text-muted">(disembunyikan)</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {p.service?.name ?? 'Semua kategori'} · {formatDuration(p.durationMinutes)}
                  </p>
                </div>
                <p className="font-semibold text-navy-900">{formatRupiah(p.price)}</p>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPkg({ id: p.id, serviceId: p.serviceId ?? '', name: p.name, description: p.description ?? '', durationMinutes: String(p.durationMinutes), price: String(Math.round(Number(p.price))), facilities: p.facilities.join('\n'), isActive: p.isActive })
                    }
                  >
                    Ubah
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => archive(p)} aria-label={`Arsipkan ${p.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ───────────── DP & transportasi ─────────────

function PaymentTab({ s, onSaved }: { s: AdminSettings; onSaved: () => void }) {
  const toast = useToast();
  const dp = s.payment.depositPolicy;
  const [pay, setPay] = useState({
    depositType: (dp?.type ?? 'UNSET') as 'UNSET' | 'PERCENT' | 'FIXED',
    depositValue: dp ? String(dp.value) : '',
    instructions: s.payment.instructions ?? '',
    bankAccounts: s.payment.bankAccounts,
  });
  const [tr, setTr] = useState({ mode: s.transport.mode, flatAmount: s.transport.flatAmount ? String(s.transport.flatAmount) : '', notes: s.transport.notes ?? '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<string | null>(null);

  const savePay = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('pay');
    setErrors({});
    try {
      await api('/admin/settings/payment', {
        method: 'PUT',
        body: { depositType: pay.depositType, ...(pay.depositType !== 'UNSET' ? { depositValue: Number(pay.depositValue) } : {}), bankAccounts: pay.bankAccounts, instructions: pay.instructions },
      });
      toast('success', 'Pengaturan pembayaran disimpan');
      onSaved();
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setBusy(null);
    }
  };
  const saveTr = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('tr');
    setErrors({});
    try {
      await api('/admin/settings/transport', { method: 'PUT', body: { mode: tr.mode, ...(tr.mode === 'FLAT' ? { flatAmount: Number(tr.flatAmount) } : {}), notes: tr.notes } });
      toast('success', 'Kebijakan transportasi disimpan');
      onSaved();
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-navy-900">DP & rekening</h2>
          {!dp && <Unset />}
        </div>
        <form onSubmit={savePay} className="mt-4 space-y-4" data-testid="payment-form">
          <Field label="Kebijakan DP" error={errors.depositType}>
            <select className="field-input" value={pay.depositType} onChange={(e) => setPay({ ...pay, depositType: e.target.value as typeof pay.depositType })}>
              <option value="UNSET">Belum dikonfigurasi</option>
              <option value="PERCENT">Persentase dari total</option>
              <option value="FIXED">Nominal tetap</option>
            </select>
          </Field>
          {pay.depositType !== 'UNSET' && (
            <Field label={pay.depositType === 'PERCENT' ? 'Persentase DP (%)' : 'Nominal DP (Rp)'} error={errors.depositValue}>
              <input className="field-input" inputMode="numeric" value={pay.depositValue} onChange={(e) => setPay({ ...pay, depositValue: e.target.value.replace(/\D/g, '') })} required />
            </Field>
          )}
          <div>
            <p className="text-sm font-semibold text-navy-900">Rekening pembayaran</p>
            {pay.bankAccounts.length === 0 && <p className="mt-1 text-xs text-muted">Belum ada rekening. Rekening hanya ditampilkan ke pelanggan yang pesanannya menunggu pembayaran.</p>}
            <div className="mt-2 space-y-2">
              {pay.bankAccounts.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1.2fr_1.2fr_auto]">
                  {(['bankName', 'accountNumber', 'accountHolder'] as const).map((k) => (
                    <input
                      key={k}
                      className="field-input"
                      placeholder={{ bankName: 'Bank', accountNumber: 'No. rekening', accountHolder: 'Atas nama' }[k]}
                      aria-label={{ bankName: 'Nama bank', accountNumber: 'Nomor rekening', accountHolder: 'Atas nama' }[k]}
                      value={b[k]}
                      onChange={(e) => setPay({ ...pay, bankAccounts: pay.bankAccounts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                      required
                    />
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPay({ ...pay, bankAccounts: pay.bankAccounts.filter((_, j) => j !== i) })} aria-label="Hapus rekening">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            {pay.bankAccounts.length < 5 && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setPay({ ...pay, bankAccounts: [...pay.bankAccounts, { bankName: '', accountNumber: '', accountHolder: '' }] })}>
                <Plus className="size-4" aria-hidden /> Tambah rekening
              </Button>
            )}
            {Object.entries(errors)
              .filter(([k]) => k.startsWith('bankAccounts'))
              .map(([k, v]) => (
                <p key={k} className="mt-1 text-xs text-rose-700">{v}</p>
              ))}
          </div>
          <Field label="Instruksi pembayaran" error={errors.instructions}>
            <textarea className="field-input min-h-20" value={pay.instructions} onChange={(e) => setPay({ ...pay, instructions: e.target.value })} maxLength={2000} />
          </Field>
          {errors._ && <Alert tone="error">{errors._}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" variant="navy" loading={busy === 'pay'}>
              Simpan
            </Button>
          </div>
        </form>
      </Card>

      <Card className="h-fit p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-navy-900">Biaya transportasi</h2>
          {s.transport.mode === 'UNSET' && <Unset />}
        </div>
        <form onSubmit={saveTr} className="mt-4 space-y-4" data-testid="transport-form">
          <Field label="Kebijakan">
            <select className="field-input" value={tr.mode} onChange={(e) => setTr({ ...tr, mode: e.target.value as typeof tr.mode })}>
              <option value="UNSET">Belum dikonfigurasi</option>
              <option value="FLAT">Tarif tetap</option>
              <option value="PER_BOOKING">Ditentukan per pesanan</option>
            </select>
          </Field>
          {tr.mode === 'FLAT' && (
            <Field label="Tarif tetap (Rp)" error={errors.flatAmount}>
              <input className="field-input" inputMode="numeric" value={tr.flatAmount} onChange={(e) => setTr({ ...tr, flatAmount: e.target.value.replace(/\D/g, '') })} required />
            </Field>
          )}
          <Field label="Catatan (mis. area layanan)" error={errors.notes}>
            <textarea className="field-input min-h-20" value={tr.notes} onChange={(e) => setTr({ ...tr, notes: e.target.value })} maxLength={1000} />
          </Field>
          <p className="text-xs text-muted">Biaya transportasi untuk setiap pesanan tetap ditetapkan di rincian biaya pesanan tersebut.</p>
          <div className="flex justify-end">
            <Button type="submit" variant="navy" loading={busy === 'tr'}>
              Simpan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ───────────── Aturan jadwal ─────────────

function RulesTab({ s, onSaved }: { s: AdminSettings; onSaved: () => void }) {
  const toast = useToast();
  const r = s.bookingRules;
  const [f, setF] = useState({ travelBufferMinutes: String(r.travelBufferMinutes), minLeadTimeHours: String(r.minLeadTimeHours), maxAdvanceDays: String(r.maxAdvanceDays) });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api('/admin/settings/booking-rules', { method: 'PUT', body: { travelBufferMinutes: Number(f.travelBufferMinutes), minLeadTimeHours: Number(f.minLeadTimeHours), maxAdvanceDays: Number(f.maxAdvanceDays) } });
      toast('success', 'Aturan jadwal disimpan');
      onSaved();
    } catch (err) {
      setErrors(errorsOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-navy-900">Aturan jadwal</h2>
        {r.confirmedAt ? <span className="text-xs text-muted">Dikonfirmasi {formatDateTime(r.confirmedAt)}</span> : <Unset>Nilai awal (asumsi) — belum dikonfirmasi</Unset>}
      </div>
      <form onSubmit={save} className="mt-5 grid gap-5 sm:grid-cols-3" data-testid="rules-form">
        <Field label="Jeda perjalanan (menit)" error={errors.travelBufferMinutes} hint="Sebelum & sesudah acara">
          <input className="field-input" type="number" min={0} max={480} value={f.travelBufferMinutes} onChange={(e) => setF({ ...f, travelBufferMinutes: e.target.value })} name="travelBufferMinutes" />
        </Field>
        <Field label="Minimal pemesanan (jam)" error={errors.minLeadTimeHours} hint="Sebelum acara dimulai">
          <input className="field-input" type="number" min={0} max={720} value={f.minLeadTimeHours} onChange={(e) => setF({ ...f, minLeadTimeHours: e.target.value })} name="minLeadTimeHours" />
        </Field>
        <Field label="Maksimal ke depan (hari)" error={errors.maxAdvanceDays}>
          <input className="field-input" type="number" min={1} max={730} value={f.maxAdvanceDays} onChange={(e) => setF({ ...f, maxAdvanceDays: e.target.value })} name="maxAdvanceDays" />
        </Field>
        {errors._ && <Alert tone="error" className="sm:col-span-3">{errors._}</Alert>}
        <div className="flex justify-end sm:col-span-3">
          <Button type="submit" variant="navy" loading={saving}>
            Simpan & konfirmasi
          </Button>
        </div>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Pesanan yang menunggu persetujuan tidak mengunci jadwal. Jadwal terkunci saat pesanan diterima; sistem menolak menerima pesanan yang bentrok, termasuk jeda perjalanan.
      </p>
      {!s.bookingForm.verifiedAgainstOriginalForm && (
        <Alert className="mt-4" title="Formulir pemesanan belum diverifikasi">
          Pertanyaan form masih usulan dan belum dicocokkan dengan Google Form lama.
        </Alert>
      )}
    </Card>
  );
}

// ───────────── Portfolio ─────────────

function PortfolioTab() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [video, setVideo] = useState({ url: '', title: '' });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => api<PortfolioItem[]>('/admin/portfolio').then(setItems), []);
  useEffect(() => {
    void load();
  }, [load]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const up = await apiUpload<{ key: string }>('/admin/media', file);
      await api('/admin/portfolio', { method: 'POST', body: { mediaType: 'IMAGE', storageKey: up.key, title: file.name.replace(/\.[^.]+$/, '').slice(0, 150) } });
      toast('success', 'Foto ditambahkan ke portfolio');
      await load();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Gagal mengunggah');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addVideo = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/admin/portfolio', { method: 'POST', body: { mediaType: 'VIDEO', externalUrl: video.url, title: video.title } });
      setVideo({ url: '', title: '' });
      toast('success', 'Video ditambahkan');
      await load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Gagal');
    }
  };

  const move = async (i: number, d: -1 | 1) => {
    if (!items) return;
    const ids = items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    setItems(await api<PortfolioItem[]>('/admin/portfolio/reorder', { method: 'POST', body: { ids } }));
  };

  const update = async (p: PortfolioItem, body: Record<string, unknown>) => {
    await api(`/admin/portfolio/${p.id}`, { method: 'PATCH', body });
    await load();
  };

  if (!items) return <Spinner />;
  return (
    <div className="space-y-6">
      {dialog}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="font-semibold text-navy-900">Unggah foto</p>
          <p className="mt-1 text-xs text-muted">JPG, PNG, WEBP · maks. 5 MB</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])} />
          <Button variant="navy" size="sm" className="mt-3" loading={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="size-4" aria-hidden /> Pilih foto
          </Button>
        </Card>
        <Card className="p-5">
          <p className="font-semibold text-navy-900">Tambah video (tautan)</p>
          <form onSubmit={addVideo} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className="field-input" type="url" placeholder="https://www.instagram.com/reel/…" value={video.url} onChange={(e) => setVideo({ ...video, url: e.target.value })} required aria-label="Tautan video" />
            <Button type="submit" variant="navy" size="md">
              <Video className="size-4" aria-hidden /> Tambah
            </Button>
          </form>
        </Card>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-100/50 p-10 text-center text-sm text-muted">
          Portfolio masih kosong. Selama kosong, website mengarahkan pengunjung ke Instagram @hari.jasamc.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="portfolio-list">
          {items.map((p, i) => (
            <li key={p.id} className={clsx('overflow-hidden rounded-2xl border bg-white shadow-soft', p.isActive ? 'border-line' : 'border-dashed border-cream-300 opacity-70')}>
              <div className="aspect-video bg-navy-900">
                {p.mediaType === 'IMAGE' && p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={p.title ?? ''} className="h-full w-full object-cover" />
                ) : (
                  <a href={p.url ?? '#'} target="_blank" rel="noopener noreferrer" className="grid h-full place-items-center text-cream-200">
                    <Video className="size-8" aria-hidden />
                  </a>
                )}
              </div>
              <div className="space-y-2 p-4">
                <input className="field-input" defaultValue={p.title ?? ''} placeholder="Judul" aria-label="Judul" onBlur={(e) => e.target.value !== (p.title ?? '') && void update(p, { title: e.target.value })} />
                <textarea className="field-input min-h-16" defaultValue={p.caption ?? ''} placeholder="Caption" aria-label="Caption" onBlur={(e) => e.target.value !== (p.caption ?? '') && void update(p, { caption: e.target.value })} />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="Geser ke atas">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={i === items.length - 1} onClick={() => void move(i, 1)} aria-label="Geser ke bawah">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void update(p, { isActive: !p.isActive })} aria-label={p.isActive ? 'Sembunyikan' : 'Tampilkan'}>
                    {p.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Hapus"
                    onClick={() =>
                      confirm({
                        title: 'Hapus konten portfolio?',
                        description: 'Konten tidak lagi tampil di website.',
                        confirmLabel: 'Hapus',
                        tone: 'danger',
                        onConfirm: async () => {
                          await api(`/admin/portfolio/${p.id}`, { method: 'DELETE' });
                          toast('success', 'Konten dihapus');
                          await load();
                        },
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────── Ulasan Google ─────────────

function GoogleReviewsCard({ s, onSaved }: { s: AdminSettings; onSaved: () => void }) {
  const toast = useToast();
  const [placeId, setPlaceId] = useState(s.integrations.googleReviews?.placeId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const link = s.integrations.googleReviewLink;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/admin/settings/google-reviews', { method: 'PUT', body: { placeId: placeId.trim() } });
      toast('success', placeId.trim() ? 'Place ID disimpan — tombol ulasan kini langsung membuka form Google' : 'Place ID dihapus — tombol ulasan membuka halaman Google Maps');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors[0]?.message ?? err.message) : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6" data-testid="google-reviews-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-navy-900">Ajakan ulasan Google</h2>
        {link?.direct ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Langsung ke form ulasan</span>
        ) : (
          <Unset>Place ID belum diisi</Unset>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Setelah acara ditandai <strong className="text-navy-900">Selesai</strong>, setiap pelanggan otomatis diajak memberi ulasan di Google. Sesuai kebijakan Google,
        ajakan dikirim ke semua pelanggan tanpa memilih dan tanpa imbalan.
        {!link?.direct && ' Selama Place ID kosong, tombol membuka halaman Google Maps dan pelanggan memilih “Tulis ulasan” sendiri.'}
      </p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="field-input"
          placeholder="Place ID, contoh: ChIJ…"
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          aria-label="Google Place ID"
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" variant="navy" loading={saving}>
          Simpan
        </Button>
      </form>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        Cari Place ID dengan{' '}
        <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="font-medium text-gold-700 underline">
          Place ID Finder Google
        </a>{' '}
        (ketik “Jasa MC Ultah Kak Hari”).
      </p>
      {link && (
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-gold-700 hover:text-navy-900">
          Uji tautan ulasan ↗
        </a>
      )}
    </Card>
  );
}
