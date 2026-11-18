import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORTED_TIMEZONES } from '../bookings/schedule';
import { SettingsService, type FaqItem } from './settings.service';
import { portfolioView } from '../storage/portfolio-view';

const activeServices = {
  where: { isActive: true, deletedAt: null },
  orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
  select: {
    id: true,
    slug: true,
    name: true,
    description: true,
    packages: {
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' as const },
      select: { id: true, name: true, description: true, durationMinutes: true, price: true, currency: true, facilities: true },
    },
  },
};

@ApiTags('public')
@Controller()
export class SiteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Semua data landing page dalam satu request. Hanya data nyata dari database — tanpa angka/ulasan buatan. */
  @Public()
  @Get('site')
  @ApiOperation({ summary: 'Data landing page (profil, layanan, FAQ, tautan Google/Instagram)' })
  async site() {
    const [profile, services, faq, reviews, instagram, globalPackages, portfolio] = await Promise.all([
      this.prisma.mcProfile.findFirst({ omit: { singleton: true } }),
      this.prisma.service.findMany(activeServices),
      this.settings.get<FaqItem[]>('faq'),
      this.settings.get<{ enabled: boolean; placeId: string | null; mapsUrl: string }>('google_reviews'),
      this.settings.get<{ handle: string; profileUrl: string }>('instagram'),
      this.prisma.servicePackage.findMany({
        where: { serviceId: null, isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, durationMinutes: true, price: true, currency: true, facilities: true },
      }),
      this.prisma.portfolio.findMany({ where: { deletedAt: null, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 24 }),
    ]);
    if (!profile) throw new NotFoundException('Profil MC belum di-seed');
    return {
      profile,
      services,
      globalPackages,
      faq: faq ?? [],
      // Integrasi Google Places belum aktif (Phase 5) → hanya tautan Maps; tidak ada rating/ulasan buatan.
      reviews: { source: 'google', integrationActive: false, mapsUrl: reviews?.mapsUrl ?? profile.googleMapsUrl },
      instagram: instagram ?? { handle: profile.instagramHandle, profileUrl: profile.instagramUrl },
      portfolio: portfolio.map(portfolioView).map(({ isActive: _a, sortOrder: _s, ...p }) => p),
    };
  }

  /** Definisi form booking (configurable) + data pendukung untuk merender form di web/Android. */
  @Public()
  @Get('booking-form')
  @ApiOperation({ summary: 'Konfigurasi form booking, kategori, paket, zona waktu, dan aturan jadwal' })
  async bookingForm() {
    const [form, rules, services, globalPackages] = await Promise.all([
      this.settings.bookingForm(),
      this.settings.bookingRules(),
      this.prisma.service.findMany(activeServices),
      this.prisma.servicePackage.findMany({
        where: { serviceId: null, isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, description: true, durationMinutes: true, price: true, currency: true, facilities: true },
      }),
    ]);
    return {
      form,
      rules: { minLeadTimeHours: rules.minLeadTimeHours, maxAdvanceDays: rules.maxAdvanceDays },
      services,
      globalPackages,
      timezones: Object.entries(SUPPORTED_TIMEZONES).map(([id, v]) => ({ id, label: v.label })),
    };
  }
}
