import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * CSP: hanya mengizinkan Google Identity Services (tombol login Google) sebagai pihak ketiga.
 * 'unsafe-inline' untuk script diperlukan oleh bootstrap Next.js tanpa nonce; 'unsafe-eval' hanya di dev (HMR).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ''}https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https:",
  // data: dibutuhkan font ikon FullCalendar (disematkan sebagai data URI)
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Google Sign-In (FedCM) membutuhkan izin identity-credentials-get.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), identity-credentials-get=(self "https://accounts.google.com")' },
          // Popup Google Sign-In butuh same-origin-allow-popups.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
    ];
  },
};

export default nextConfig;
