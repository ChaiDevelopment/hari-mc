'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Container, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { CustomerProfile } from '@/lib/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({ name: '', whatsapp: '', city: '' });
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<CustomerProfile>('/me/profile')
      .then((p) => {
        setProfile(p);
        setForm({ name: p.name, whatsapp: p.whatsapp ? `0${p.whatsapp.slice(3)}` : '', city: p.city ?? '' });
      })
      .catch((e) => setStatus({ tone: 'error', msg: e instanceof ApiError ? e.message : 'Gagal memuat profil' }));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const body: Record<string, string> = { name: form.name };
      if (form.whatsapp.trim()) body.whatsapp = form.whatsapp.replace(/[\s-]/g, '');
      if (form.city.trim()) body.city = form.city;
      setProfile(await api<CustomerProfile>('/me/profile', { method: 'PATCH', body }));
      setStatus({ tone: 'success', msg: 'Profil tersimpan. Data ini akan terisi otomatis saat Anda memesan.' });
    } catch (err) {
      setStatus({ tone: 'error', msg: err instanceof ApiError ? err.message : 'Gagal menyimpan' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="pt-10">
      <p className="eyebrow">Profil</p>
      <h1 className="mt-2 font-display text-3xl text-navy-900 sm:text-4xl">Profil akun</h1>
      {!profile && !status && <Spinner />}
      {profile && (
        <Card className="mt-8 max-w-xl p-6 sm:p-8">
          <form onSubmit={save} className="space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-navy-900">Nama</span>
              <input className="field-input mt-1.5" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-navy-900">Email</span>
              <input className="field-input mt-1.5" value={profile.email} disabled />
              <span className="mt-1 block text-xs text-muted">Email mengikuti akun Google Anda.</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-navy-900">Nomor WhatsApp</span>
              <input className="field-input mt-1.5" inputMode="tel" placeholder="081234567890" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-navy-900">Kota</span>
              <input className="field-input mt-1.5" maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            {status && <Alert tone={status.tone}>{status.msg}</Alert>}
            <Button type="submit" loading={saving}>
              Simpan profil
            </Button>
          </form>
        </Card>
      )}
      {!profile && status && <Alert tone="error" className="mt-8">{status.msg}</Alert>}
    </Container>
  );
}
