import 'server-only';
import type { SiteData } from './types';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4100';

/** Data publik untuk server components. null jika API tidak dapat dihubungi (ditangani dengan state error, bukan data palsu). */
export async function getSite(): Promise<SiteData | null> {
  try {
    // no-store: perubahan dari CMS (paket, profil, portfolio) harus langsung tampil di website.
    const res = await fetch(`${API}/api/v1/site`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SiteData;
  } catch {
    return null;
  }
}
