import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

describe('loadEnv', () => {
  it('menerima konfigurasi dev minimal dan mem-parse daftar CSV', () => {
    const env = loadEnv({ ...base, GOOGLE_CLIENT_IDS: 'a.apps, b.apps', CORS_ORIGINS: 'http://localhost:3000' });
    expect(env.GOOGLE_CLIENT_IDS).toEqual(['a.apps', 'b.apps']);
    expect(env.PORT).toBe(4100);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('menolak JWT secret pendek', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('dev login ditolak di production, boleh di development', () => {
    const prod = { ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', GOOGLE_CLIENT_IDS: 'x', CORS_ORIGINS: 'https://h.example' };
    expect(() => loadEnv({ ...prod, ENABLE_DEV_LOGIN: 'true' })).toThrow(/ENABLE_DEV_LOGIN/);
    expect(loadEnv({ ...base, ENABLE_DEV_LOGIN: 'true' }).ENABLE_DEV_LOGIN).toBe(true);
    expect(loadEnv(base).ENABLE_DEV_LOGIN).toBe(false);
  });

  it('dev admin login: ditolak di production dan wajib bersama ENABLE_DEV_LOGIN', () => {
    const prod = { ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', GOOGLE_CLIENT_IDS: 'x', CORS_ORIGINS: 'https://h.example' };
    expect(() => loadEnv({ ...prod, ENABLE_DEV_ADMIN_LOGIN: 'true' })).toThrow(/ENABLE_DEV_ADMIN_LOGIN/);
    expect(() => loadEnv({ ...base, ENABLE_DEV_ADMIN_LOGIN: 'true' })).toThrow(/membutuhkan ENABLE_DEV_LOGIN/);
    expect(loadEnv({ ...base, ENABLE_DEV_LOGIN: 'true', ENABLE_DEV_ADMIN_LOGIN: 'true' }).ENABLE_DEV_ADMIN_LOGIN).toBe(true);
  });

  it('production wajib cookie secure, Google client id, dan CORS origin', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE[\s\S]*GOOGLE_CLIENT_IDS[\s\S]*CORS_ORIGINS/);
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', GOOGLE_CLIENT_IDS: 'x', CORS_ORIGINS: 'https://hari.example' }),
    ).not.toThrow();
  });
});
