/**
 * Menjalankan PostgreSQL 17 terisolasi untuk e2e test (port 54339, data dihapus setiap run),
 * lalu menerapkan migration production yang sama + seed.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 54339;
const ROOT = join(__dirname, '..');

export default async function globalSetup() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const databaseDir = join(ROOT, '.pgdata-test');
  rmSync(databaseDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'hmc_test',
    password: 'hmc_test_pw',
    port: PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hari_mc_test');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: `postgresql://hmc_test:hmc_test_pw@127.0.0.1:${PORT}/hari_mc_test?schema=public`,
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-0123456789',
    GOOGLE_CLIENT_IDS: 'test-web-client.apps.googleusercontent.com',
    CORS_ORIGINS: 'http://localhost:3000',
    TRUST_PROXY: '1',
    COOKIE_SECURE: 'false',
    SWAGGER_ENABLED: 'true',
    // Eksplisit: Prisma memuat apps/api/.env otomatis, jangan sampai nilai dev lokal bocor ke test.
    ENABLE_DEV_LOGIN: 'false',
    ENABLE_DEV_ADMIN_LOGIN: 'false',
    STORAGE_DIR: join(ROOT, '.storage-test'),
  });

  const opts = { cwd: ROOT, env: process.env, stdio: 'pipe' as const };
  execSync('pnpm exec prisma migrate deploy', opts);
  execSync('pnpm exec tsx prisma/seed.ts', opts);

  (globalThis as Record<string, unknown>).__HMC_PG__ = pg;
}
