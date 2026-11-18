'use client';

import { FlaskConical, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { GoogleSignInButton } from '@/components/google-sign-in';
import { Alert, Button, Spinner } from '@/components/ui';
import { api, ApiError, loginDev, loginWithGoogle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { safeNextPath } from '@/lib/format';

interface AuthConfig {
  googleClientId: string | null;
  devAdminLoginEnabled: boolean;
}

function AdminLogin() {
  const { state } = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'), '/admin');
  const target = next.startsWith('/admin') ? next : '/admin';
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [showDev, setShowDev] = useState(false);

  useEffect(() => {
    api<AuthConfig>('/auth/config', { auth: false })
      .then(setConfig)
      .catch(() => setError('Server tidak dapat dihubungi'));
  }, []);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    router.replace(state.user.role === 'ADMIN' ? target : '/admin/tidak-diizinkan');
  }, [state, router, target]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login gagal');
    } finally {
      setBusy(false);
    }
  };

  const onDev = (e: FormEvent) => {
    e.preventDefault();
    void run(() => loginDev(email, 'Admin'));
  };

  return (
    <main id="konten" className="hero-glow flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center sm:py-12">
      <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-navy-900/80 p-7 text-cream-50 shadow-lift backdrop-blur sm:p-9">
        <span className="grid size-12 place-items-center rounded-full border border-gold-400/60 font-display text-lg text-gold-300 italic">HS</span>
        <p className="eyebrow mt-6 text-gold-400">Studio CMS</p>
        <h1 className="mt-2 font-display text-3xl">Masuk sebagai Admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-cream-200/75">Khusus Hari Susanto. Akses diberikan hanya untuk akun Google yang telah didaftarkan sebagai admin di server.</p>

        <div className="mt-8 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {state.status === 'loading' || !config ? (
            !error && <Spinner />
          ) : (
            <>
              {config.googleClientId ? (
                <GoogleSignInButton clientId={config.googleClientId} onCredential={(t) => void run(() => loginWithGoogle(t))} />
              ) : (
                <Alert title="Login Google belum dikonfigurasi">Isi GOOGLE_CLIENT_IDS di server untuk mengaktifkan login Google.</Alert>
              )}
              {config.devAdminLoginEnabled && config.googleClientId && !showDev && (
                <button type="button" onClick={() => setShowDev(true)} className="mx-auto flex items-center gap-1.5 pt-2 text-xs font-medium text-cream-200/60 underline-offset-2 hover:text-gold-300 hover:underline">
                  <FlaskConical className="size-3.5" aria-hidden /> Masuk tanpa Google (mode uji)
                </button>
              )}
              {config.devAdminLoginEnabled && (!config.googleClientId || showDev) && (
                <form onSubmit={onDev} className="space-y-3 rounded-xl border border-dashed border-amber-300/60 bg-amber-50/10 p-4" data-testid="dev-admin-login">
                  <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-amber-200 uppercase">
                    <FlaskConical className="size-3.5" aria-hidden /> Mode pengembangan
                  </p>
                  <p className="text-xs leading-relaxed text-cream-200/70">
                    Hanya untuk akun admin yang sudah diprovisioning lewat CLI. Nonaktif dan ditolak di production.
                  </p>
                  <label className="block">
                    <span className="text-sm font-medium">Email admin</span>
                    <input className="field-input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </label>
                  <Button type="submit" className="w-full" loading={busy}>
                    Masuk (mode uji)
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
        <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-cream-200/60">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-400" aria-hidden />
          Tidak ada pendaftaran admin. Setiap tindakan di CMS tercatat di audit log.
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminLogin />
    </Suspense>
  );
}
