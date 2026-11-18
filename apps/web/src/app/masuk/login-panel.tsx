'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmailLogin } from '@/components/email-login';
import { GoogleSignInButton } from '@/components/google-sign-in';
import { Alert, Card, Spinner } from '@/components/ui';
import { api, ApiError, loginWithGoogle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { safeNextPath } from '@/lib/format';

interface AuthConfig {
  googleClientId: string | null;
  emailLoginEnabled: boolean;
  emailDevMailbox: boolean;
}

export function LoginPanel() {
  const { state } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AuthConfig>('/auth/config', { auth: false })
      .then(setConfig)
      .catch(() => setConfigError(true));
  }, []);

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next);
  }, [state.status, next, router]);

  const onGoogle = async (idToken: string) => {
    setError(null);
    try {
      await loginWithGoogle(idToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login gagal. Coba lagi.');
    }
  };

  if (state.status !== 'anonymous') return <Spinner label={state.status === 'authenticated' ? 'Mengalihkan…' : 'Memeriksa sesi…'} />;

  const hasGoogle = !!config?.googleClientId;
  const hasEmail = !!config?.emailLoginEnabled;

  return (
    <Card className="w-full max-w-md p-7 sm:p-9">
      <p className="eyebrow">Selamat datang</p>
      <h1 className="mt-3 font-display text-3xl text-navy-900">Masuk atau daftar</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Masuk untuk memesan jasa MC dan memantau status pesanan Anda. Belum punya akun? Akun dibuat otomatis — tanpa kata sandi.
      </p>

      <div className="mt-8 space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {!config && !configError && <Spinner label="Menyiapkan login…" />}
        {configError && <Alert tone="error" title="Server tidak dapat dihubungi">Muat ulang halaman beberapa saat lagi.</Alert>}

        {hasGoogle && <GoogleSignInButton clientId={config!.googleClientId!} onCredential={onGoogle} />}

        {hasGoogle && hasEmail && (
          <div className="flex items-center gap-3 py-1 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" /> atau dengan email <span className="h-px flex-1 bg-line" />
          </div>
        )}

        {hasEmail && <EmailLogin devMailbox={config!.emailDevMailbox} onDone={() => router.replace(next)} />}

        {config && !hasGoogle && !hasEmail && (
          <Alert title="Login belum tersedia">Pemilik situs perlu mengaktifkan login Google atau pengiriman email di server.</Alert>
        )}
      </div>

      <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
        <span>
          Dengan masuk, Anda menyetujui pemrosesan data sesuai{' '}
          <Link href="/kebijakan-privasi" className="font-medium text-navy-900 underline decoration-gold-400 underline-offset-2">
            Kebijakan Privasi
          </Link>
          .
        </span>
      </p>
    </Card>
  );
}
