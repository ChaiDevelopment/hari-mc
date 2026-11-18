import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BookingFormConfig } from '../bookings/form-config';
import { DEFAULT_BOOKING_RULES, type BookingRules } from '../bookings/schedule';

export interface FaqItem {
  question: string;
  answer: string;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string, tx: Prisma.TransactionClient = this.prisma): Promise<T | null> {
    const row = await tx.businessSetting.findUnique({ where: { key } });
    return (row?.value as T | undefined) ?? null;
  }

  async bookingForm(tx?: Prisma.TransactionClient): Promise<BookingFormConfig> {
    const cfg = await this.get<BookingFormConfig>('booking_form', tx);
    if (!cfg) throw new Error('Setting booking_form belum di-seed');
    return { ...cfg, extraQuestions: cfg.extraQuestions ?? [] };
  }

  /**
   * Tautan ajakan ulasan Google. Dengan Place ID → langsung ke form "Tulis ulasan";
   * tanpa Place ID → halaman profil Google Maps (pelanggan klik "Tulis ulasan" sendiri).
   */
  async googleReviewLink(tx: Prisma.TransactionClient = this.prisma): Promise<{ url: string; direct: boolean } | null> {
    const cfg = await this.get<{ placeId?: string | null; mapsUrl?: string | null }>('google_reviews', tx);
    if (cfg?.placeId) return { url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(cfg.placeId)}`, direct: true };
    const profile = await tx.mcProfile.findFirst({ select: { googleMapsUrl: true } });
    const maps = cfg?.mapsUrl ?? profile?.googleMapsUrl ?? null;
    return maps ? { url: maps, direct: false } : null;
  }

  async bookingRules(tx?: Prisma.TransactionClient): Promise<BookingRules> {
    const r = await this.get<Partial<BookingRules>>('booking_rules', tx);
    return { ...DEFAULT_BOOKING_RULES, ...(r ?? {}) };
  }
}
