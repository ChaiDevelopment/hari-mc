'use client';

import { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: Record<string, unknown>): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Gagal memuat Google Sign-In'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Tombol resmi "Sign in with Google" (Google Identity Services).
 * Menghasilkan ID token yang diverifikasi oleh API — frontend tidak pernah mempercayai isi token sendiri.
 */
export function GoogleSignInButton({ clientId, onCredential }: { clientId: string; onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r: GoogleCredentialResponse) => cb.current(r.credential),
          ux_mode: 'popup',
          use_fedcm_for_button: true,
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          locale: 'id',
          width: Math.min(ref.current.offsetWidth || 320, 400),
        });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div>
      <div ref={ref} className="flex min-h-11 w-full justify-center" />
      {error && <p className="mt-2 text-center text-sm text-rose-700">{error}. Periksa koneksi internet Anda.</p>}
    </div>
  );
}
