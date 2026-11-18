/**
 * Stack E2E terisolasi: PostgreSQL embedded (port 54349, data dibuang) → migrate + seed →
 * API NestJS hasil build (port 4199) → Next.js production build (port 3499).
 * Tidak menyentuh database dev. Mengembalikan fungsi teardown.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const API_DIR = join(ROOT, 'apps', 'api');
const WEB_DIR = join(ROOT, 'apps', 'web');
const LOG_DIR = join(WEB_DIR, 'test-results', 'stack-logs');
export const PG_PORT = 54349;
export const API_PORT = 4199;
export const WEB_PORT = 3499;
export const E2E_ADMIN_EMAIL = 'cms.e2e@example.com';

async function waitFor(url: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout menunggu ${url}`);
}

function start(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const out = createWriteStream(join(LOG_DIR, `${name}.log`));
  const child = spawn(cmd, args, { cwd, env, shell: false, windowsHide: true });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return child;
}

function kill(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* sudah berhenti */
    }
  } else child.kill('SIGTERM');
}

export default async function globalSetup() {
  mkdirSync(LOG_DIR, { recursive: true });
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = join(API_DIR, '.pgdata-e2e');
  const storageDir = join(API_DIR, '.storage-e2e');
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(storageDir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'hmc_e2e',
    password: 'hmc_e2e_pw',
    port: PG_PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('hari_mc_e2e');

  const apiEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_URL: `postgresql://hmc_e2e:hmc_e2e_pw@127.0.0.1:${PG_PORT}/hari_mc_e2e?schema=public`,
    JWT_ACCESS_SECRET: 'e2e-secret-e2e-secret-e2e-secret-0123456789',
    GOOGLE_CLIENT_IDS: '',
    CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
    TRUST_PROXY: '1',
    COOKIE_SECURE: 'false',
    ENABLE_DEV_LOGIN: 'true',
    ENABLE_DEV_ADMIN_LOGIN: 'true',
    STORAGE_DIR: storageDir,
  };
  execSync('pnpm exec prisma migrate deploy', { cwd: API_DIR, env: apiEnv, stdio: 'pipe' });
  execSync('pnpm exec tsx prisma/seed.ts', { cwd: API_DIR, env: apiEnv, stdio: 'pipe' });
  // Admin uji diprovisioning dengan CLI resmi (sama seperti produksi), hanya di database E2E yang dibuang.
  execSync(`pnpm exec tsx scripts/provision-admin.ts --email ${E2E_ADMIN_EMAIL} --name "Hari Susanto"`, { cwd: API_DIR, env: apiEnv, stdio: 'pipe' });

  const api = start('api', process.execPath, ['dist/main.js'], API_DIR, apiEnv);
  await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`, 60_000);

  const nextBin = join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
  const web = start('web', process.execPath, [nextBin, 'start', '-p', String(WEB_PORT)], WEB_DIR, {
    ...process.env,
    NODE_ENV: 'production',
    API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
  });
  await waitFor(`http://localhost:${WEB_PORT}/`, 90_000);

  return async () => {
    kill(web);
    kill(api);
    await pg.stop();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(storageDir, { recursive: true, force: true });
  };
}
