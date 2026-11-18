import { rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalTeardown() {
  const pg = (globalThis as Record<string, unknown>).__HMC_PG__ as { stop: () => Promise<void> } | undefined;
  await pg?.stop();
  rmSync(join(__dirname, '..', '.pgdata-test'), { recursive: true, force: true });
  rmSync(join(__dirname, '..', '.storage-test'), { recursive: true, force: true });
}
