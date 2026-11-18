'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { logout as apiLogout, onSessionChange, refreshSession, type Session } from './api';
import type { PublicUser } from './types';

type AuthState = { status: 'loading' | 'anonymous'; user: null } | { status: 'authenticated'; user: PublicUser };

interface AuthContextValue {
  state: AuthState;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    const apply = (s: Session | null) => setState(s ? { status: 'authenticated', user: s.user } : { status: 'anonymous', user: null });
    const off = onSessionChange(apply);
    // Pulihkan sesi dari cookie httpOnly (aman dipanggil berulang: single-flight).
    void refreshSession();
    return () => {
      off();
    };
  }, []);

  const logout = async () => {
    await apiLogout();
  };

  return <AuthContext.Provider value={{ state, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}

/**
 * Halaman customer: arahkan ke /masuk jika belum login.
 * Ini hanya UX — keamanan data tetap ditegakkan API (setiap endpoint memeriksa token & kepemilikan).
 */
export function useRequireCustomer(): PublicUser | null {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (state.status === 'anonymous') {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(`/masuk?next=${encodeURIComponent(pathname + search)}`);
    }
  }, [state.status, pathname, router]);
  return state.status === 'authenticated' ? state.user : null;
}
