'use client';

import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, setSession, type Session } from '@/lib/api';
import { Alert, Button } from './ui';

type Step = 'email' | 'code' | 'profile';

/**
 * Masuk / daftar tanpa password: kode 6 digit dikirim ke email.
 * Akun baru langsung dibuat saat kode benar; setelah itu pelanggan diminta melengkapi nama & WhatsApp.
 */
export function EmailLogin({ devMailbox, onDone }: { devMailbox?: boolean; onDone: () => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState({ name: '', whatsapp: '' });
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await api<{ resendAfterSeconds: number }>('/auth/email/request', { method: 'POST', body: { email }, auth: false });
      setStep('code');
      setCode('');
      setCooldown(r.resendAfterSeconds);
      setInfo(`Kode dikirim ke ${email}. Cek juga folder spam.`);
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim kode');
      if (err instanceof ApiError && err.code === 'RESEND_COOLDOWN') setStep('code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api<Session & { isNewUser: boolean }>('/auth/email/verify', { method: 'POST', body: { email, code, client: 'web' }, auth: false });
      if (r.isNewUser) {
        // Simpan sesi dulu di sini; diterapkan setelah profil dilengkapi agar halaman tidak langsung beralih.
        setPendingSession(r);
        setProfile({ name: '', whatsapp: '' });
        setStep('profile');
      } else {
        setSession(r);
        onDone();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verifikasi gagal');
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingSession) return;
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, string> = { name: profile.name.trim() };
      if (profile.whatsapp.trim()) body.whatsapp = profile.whatsapp.replace(/[\s-]/g, '');
      const updated = await api<{ name: string }>('/me/profile', { method: 'PATCH', body, headers: { Authorization: `Bearer ${pendingSession.accessToken}` } });
      setSession({ ...pendingSession, user: { ...pendingSession.user, name: updated.name } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="email-login">
      {step === 'email' && (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-navy-900">Email</span>
            <input
              className="field-input mt-1.5"
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="navy" className="w-full" loading={busy}>
            <Mail className="size-4" aria-hidden /> Kirim kode masuk
          </Button>
          <p className="text-center text-xs text-muted">Belum punya akun? Akun dibuat otomatis — tanpa kata sandi.</p>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="space-y-3">
          <button type="button" onClick={() => setStep('email')} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-navy-900">
            <ArrowLeft className="size-3.5" aria-hidden /> Ganti email
          </button>
          {info && <Alert tone="success">{info}</Alert>}
          {devMailbox && (
            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              Server development tanpa SMTP: email tidak dikirim. Kode tercetak di konsol server API dan folder <code>apps/api/storage/dev-mailbox</code>.
            </p>
          )}
          <label className="block">
            <span className="text-sm font-semibold text-navy-900">Kode 6 digit</span>
            <input
              ref={codeRef}
              className="field-input mt-1.5 text-center font-mono text-2xl tracking-[0.5em]"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={error ? true : undefined}
            />
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="navy" className="w-full" loading={busy} disabled={code.length !== 6}>
            Masuk
          </Button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={cooldown > 0 || busy}
            className="mx-auto block text-xs font-semibold text-gold-700 disabled:font-normal disabled:text-muted"
          >
            {cooldown > 0 ? `Kirim ulang kode dalam ${cooldown} dtk` : 'Kirim ulang kode'}
          </button>
        </form>
      )}

      {step === 'profile' && (
        <form onSubmit={saveProfile} className="space-y-3" data-testid="complete-profile">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="size-4" aria-hidden /> Email terverifikasi — lengkapi data Anda
          </p>
          <label className="block">
            <span className="text-sm font-semibold text-navy-900">Nama lengkap</span>
            <input className="field-input mt-1.5" name="name" required minLength={2} maxLength={120} autoComplete="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-navy-900">
              Nomor WhatsApp <span className="text-xs font-normal text-muted">(opsional)</span>
            </span>
            <input className="field-input mt-1.5" name="whatsapp" inputMode="tel" autoComplete="tel" placeholder="081234567890" value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} />
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>
            Simpan & lanjutkan
          </Button>
        </form>
      )}
    </div>
  );
}
