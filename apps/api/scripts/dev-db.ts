/**
 * PostgreSQL 17 lokal untuk development tanpa Docker/instalasi sistem.
 * Memakai binary resmi PostgreSQL yang dikemas `embedded-postgres`.
 * Data persisten di apps/api/.pgdata (gitignored). Hentikan dengan Ctrl+C.
 *
 * Production TIDAK memakai ini — gunakan PostgreSQL biasa (lihat infrastructure/docker).
 */
// embedded-postgres hanya ESM → dynamic import.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const url = new URL(process.env.DATABASE_URL ?? '');
const databaseDir = join(__dirname, '..', '.pgdata');
const port = Number(url.port || 5432);
const dbName = url.pathname.replace(/^\//, '');

async function main() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`DATABASE_URL harus mengarah ke localhost untuk dev-db (sekarang: ${url.hostname})`);
  }
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port,
    persistent: true,
    // Wajib UTF-8: tanpa ini initdb di Windows memakai WIN1252.
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--auth=scram-sha-256'],
    onLog: () => undefined,
  });
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
    console.log('[dev-db] initdb ...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(dbName);
    console.log(`[dev-db] database "${dbName}" dibuat`);
  } catch {
    /* sudah ada */
  }
  console.log(`[dev-db] PostgreSQL berjalan di 127.0.0.1:${port}, database "${dbName}". Ctrl+C untuk berhenti.`);
  const shutdown = async () => {
    console.log('\n[dev-db] menghentikan ...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => undefined, 1 << 30);
}

main().catch((e) => {
  console.error('[dev-db] gagal:', e);
  process.exit(1);
});
