import { createHash, randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'hmc_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const CSRF_HEADER = 'x-hmc-csrf';

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
