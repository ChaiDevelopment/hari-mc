import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  /** Kunci unik event → retry/duplikat tidak menghasilkan notifikasi ganda. */
  dedupeKey: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Simpan notifikasi in-app di dalam transaksi bisnis yang sama.
   * Push FCM belum aktif (Phase 4/5) → push_status tetap NOT_REQUESTED.
   */
  async enqueue(items: NotificationInput[], tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (items.length === 0) return;
    await tx.notification.createMany({
      data: items.map((n) => ({ ...n, data: n.data ?? {} })),
      skipDuplicates: true,
    });
  }

  async adminUserId(tx: Prisma.TransactionClient = this.prisma): Promise<string | null> {
    const admin = await tx.user.findFirst({ where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    return admin?.id ?? null;
  }

  async list(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unread, page, pageSize };
  }

  /** Hanya menandai milik user sendiri (ownership di klausa where). */
  async markRead(userId: string, id: string): Promise<boolean> {
    const r = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (r.count > 0) return true;
    return (await this.prisma.notification.count({ where: { id, userId } })) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const r = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return r.count;
  }
}
