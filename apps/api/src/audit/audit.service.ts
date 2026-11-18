import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestMeta } from '../common/request-meta';

export interface AuditEntry {
  actorUserId?: string | null;
  actorType: ActorType;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Tulis audit log. Berikan `tx` agar audit ikut commit/rollback bersama perubahan bisnis. */
  async log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata ?? {},
        ipAddress: entry.meta?.ipAddress,
        userAgent: entry.meta?.userAgent,
      },
    });
  }

  /** Untuk event keamanan di luar transaksi: jangan gagalkan request jika audit gagal, tapi catat. */
  async logSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.log(entry);
    } catch (e) {
      this.logger.error(`Gagal menulis audit log ${entry.action}`, e as Error);
    }
  }
}
