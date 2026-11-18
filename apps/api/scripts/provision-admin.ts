/**
 * Provisioning admin (Hari Susanto) secara aman — dijalankan operator di server, BUKAN endpoint publik.
 *
 *   pnpm --filter @hmc/api admin:provision --email hari@gmail.com [--name "Hari Susanto"] [--replace]
 *
 * - Tidak ada password. Hari login dengan akun Google yang emailnya terverifikasi sama dengan --email.
 * - Database menegakkan hanya ada SATU admin aktif. --replace mencabut admin lama (jadi CUSTOMER + sesi dicabut).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';

const prisma = new PrismaClient();

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string', default: 'Hari Susanto' },
      replace: { type: 'boolean', default: false },
    },
  });
  const email = (values.email ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Berikan --email <email Google Hari> atau set ADMIN_EMAIL');
  }
  const name = values.name!;

  await prisma.$transaction(async (tx) => {
    const currentAdmin = await tx.user.findFirst({ where: { role: 'ADMIN', deletedAt: null } });
    if (currentAdmin && currentAdmin.email !== email) {
      if (!values.replace) {
        throw new Error(`Sudah ada admin aktif (${currentAdmin.email}). Gunakan --replace untuk menggantinya.`);
      }
      await tx.adminProfile.deleteMany({ where: { userId: currentAdmin.id } });
      await tx.user.update({ where: { id: currentAdmin.id }, data: { role: 'CUSTOMER' } });
      await tx.refreshToken.updateMany({
        where: { userId: currentAdmin.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'ADMIN_REPLACED' },
      });
      await tx.auditLog.create({
        data: { actorType: 'SYSTEM', action: 'ADMIN_REVOKED', entityType: 'user', entityId: currentAdmin.id, metadata: { by: 'provision-admin' } },
      });
    }

    const existing = await tx.user.findUnique({ where: { email } });
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null } })
      : await tx.user.create({ data: { email, name, role: 'ADMIN' } });

    await tx.adminProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, displayName: name },
      update: { displayName: name },
    });
    if (existing && existing.role !== 'ADMIN') {
      // Token lama masih ber-role CUSTOMER → paksa login ulang.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'ROLE_CHANGED' },
      });
    }
    await tx.auditLog.create({
      data: { actorType: 'SYSTEM', action: 'ADMIN_PROVISIONED', entityType: 'user', entityId: user.id, metadata: { email } },
    });
    console.log(`[admin] ${email} sekarang admin. Login lewat Google dengan akun ini di /admin.`);
  });
}

main()
  .catch((e) => {
    console.error('[admin] gagal:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
