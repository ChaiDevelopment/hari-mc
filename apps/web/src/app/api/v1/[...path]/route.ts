import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy same-origin ke API NestJS.
 * - Browser hanya berbicara ke origin web → cookie refresh token (httpOnly) tetap first-party.
 * - Alamat API dibaca saat runtime (API_INTERNAL_URL), tidak di-bake saat build.
 * Semua otorisasi tetap ditegakkan API; proxy ini tidak menambah atau mengurangi hak akses.
 */
export const dynamic = 'force-dynamic';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4100';
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'host',
  'content-length',
  'content-encoding',
]);

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path.some((s) => s === '.' || s === '..' || s === '')) {
    return NextResponse.json({ statusCode: 400, message: 'Path tidak valid' }, { status: 400 });
  }
  const target = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`, API);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  // Di Cloudflare Workers, IP asli pengunjung ada di CF-Connecting-IP (tidak bisa dipalsukan lewat Cloudflare).
  // Timpa X-Forwarded-For kiriman klien agar rate limit di API memakai IP sebenarnya.
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) headers.set('x-forwarded-for', cfIp);

  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual', cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json({ statusCode: 502, message: 'Server sedang tidak dapat dihubungi. Coba beberapa saat lagi.' }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!HOP_BY_HOP.has(k) && k !== 'set-cookie') out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);

  return new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
