import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { portfolioView } from '../storage/portfolio-view';
import { MEDIA_PREFIX, StorageService } from '../storage/storage.service';
import { normalizeIndonesianPhone } from '../users/phone';
import {
  BookingRulesDto,
  GoogleReviewsSettingsDto,
  PackageDto,
  PaymentSettingsDto,
  PortfolioDto,
  ReorderDto,
  ServiceDto,
  TransportSettingsDto,
  UpdatePackageDto,
  UpdatePortfolioDto,
  UpdateProfileDto,
  UpdateServiceDto,
} from './dto/admin-settings.dto';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'layanan'
  );
}

const packageSelect = {
  id: true,
  serviceId: true,
  name: true,
  description: true,
  durationMinutes: true,
  price: true,
  currency: true,
  facilities: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { name: true } },
} satisfies Prisma.ServicePackageSelect;


/**
 * Pengaturan bisnis. Nilai harga/DP/transport TIDAK memiliki default "resmi":
 * status UNSET ditampilkan sebagai "Belum dikonfigurasi" sampai Hari mengisinya.
 */
@ApiTags('admin / settings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private log(admin: AuthUser, req: Request, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue, tx?: Prisma.TransactionClient) {
    return this.audit.log({ actorUserId: admin.id, actorType: 'ADMIN', action, entityType, entityId, metadata, meta: requestMeta(req) }, tx);
  }

  private async putSetting(admin: AuthUser, req: Request, key: string, value: Prisma.InputJsonValue) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.businessSetting.findUnique({ where: { key } });
      const row = await tx.businessSetting.upsert({
        where: { key },
        create: { key, value, updatedById: admin.id },
        update: { value, updatedById: admin.id },
      });
      await this.log(admin, req, 'SETTINGS_UPDATE', 'business_setting', key, { key, before: (before?.value ?? null) as Prisma.InputJsonValue, after: value }, tx);
      return row.value;
    });
  }

  // ───────────── Ringkasan semua pengaturan ─────────────

  @Get('settings')
  @ApiOperation({ summary: 'Semua pengaturan bisnis (profil, aturan jadwal, pembayaran, transport, integrasi)' })
  async all() {
    const [profile, rules, payment, transport, reviews, instagram, form] = await Promise.all([
      this.prisma.mcProfile.findFirst({ omit: { singleton: true } }),
      this.settings.get<Record<string, unknown>>('booking_rules'),
      this.settings.get<Record<string, unknown>>('payment_info'),
      this.settings.get<Record<string, unknown>>('transport_fee'),
      this.settings.get<Record<string, unknown>>('google_reviews'),
      this.settings.get<Record<string, unknown>>('instagram'),
      this.settings.bookingForm(),
    ]);
    return {
      profile,
      bookingRules: { ...(await this.settings.bookingRules()), confirmedAt: (rules?.confirmedAt as string | undefined) ?? null },
      payment: payment ?? { depositPolicy: null, bankAccounts: [], instructions: null },
      transport: transport ?? { mode: 'UNSET', flatAmount: null, notes: null },
      integrations: { googleReviews: reviews, googleReviewLink: await this.settings.googleReviewLink(), instagram },
      bookingForm: { verifiedAgainstOriginalForm: form.verifiedAgainstOriginalForm, legacyFormUrl: form.legacyFormUrl ?? null },
    };
  }

  @Patch('settings/profile')
  @ApiOperation({ summary: 'Ubah profil Hari & bisnis' })
  async profile(@CurrentUser() admin: AuthUser, @Body() dto: UpdateProfileDto, @Req() req: Request) {
    if (dto.photoUrl?.startsWith(MEDIA_PREFIX) && !(await this.storage.exists(dto.photoUrl.slice(MEDIA_PREFIX.length)))) {
      throw new BadRequestException('Foto tidak ditemukan. Unggah ulang.');
    }
    const data = { ...dto, ...(dto.whatsappNumber ? { whatsappNumber: normalizeIndonesianPhone(dto.whatsappNumber) } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.mcProfile.findFirstOrThrow({ omit: { singleton: true } });
      const after = await tx.mcProfile.update({ where: { id: before.id }, data, omit: { singleton: true } });
      await this.log(admin, req, 'SETTINGS_PROFILE_UPDATE', 'mc_profile', before.id, { changed: Object.keys(dto), before: JSON.parse(JSON.stringify(before)) }, tx);
      return after;
    });
  }

  @Put('settings/booking-rules')
  @ApiOperation({ summary: 'Jeda perjalanan, minimal waktu pemesanan, batas hari ke depan' })
  bookingRules(@CurrentUser() admin: AuthUser, @Body() dto: BookingRulesDto, @Req() req: Request) {
    return this.putSetting(admin, req, 'booking_rules', { ...dto, confirmedAt: new Date().toISOString() });
  }

  @Put('settings/payment')
  @ApiOperation({ summary: 'Kebijakan DP, rekening, instruksi pembayaran' })
  payment(@CurrentUser() admin: AuthUser, @Body() dto: PaymentSettingsDto, @Req() req: Request) {
    if (dto.depositType === 'PERCENT' && (dto.depositValue ?? 0) > 100) {
      throw new BadRequestException({ statusCode: 400, message: 'Persentase DP maksimal 100', errors: [{ field: 'depositValue', message: 'Maksimal 100%' }] });
    }
    return this.putSetting(admin, req, 'payment_info', {
      depositPolicy: dto.depositType === 'UNSET' ? null : { type: dto.depositType, value: dto.depositValue! },
      bankAccounts: dto.bankAccounts.map((b) => ({ bankName: b.bankName, accountNumber: b.accountNumber, accountHolder: b.accountHolder })),
      instructions: dto.instructions ?? null,
    });
  }

  @Put('settings/google-reviews')
  @ApiOperation({ summary: 'Place ID Google untuk tautan "Tulis ulasan" (ajakan ulasan setelah acara selesai)' })
  async googleReviews(@CurrentUser() admin: AuthUser, @Body() dto: GoogleReviewsSettingsDto, @Req() req: Request) {
    const current = (await this.settings.get<Record<string, unknown>>('google_reviews')) ?? {};
    await this.putSetting(admin, req, 'google_reviews', { ...current, placeId: dto.placeId ?? null } as Prisma.InputJsonValue);
    return { placeId: dto.placeId ?? null, reviewLink: await this.settings.googleReviewLink() };
  }

  @Put('settings/transport')
  @ApiOperation({ summary: 'Kebijakan biaya transportasi' })
  transport(@CurrentUser() admin: AuthUser, @Body() dto: TransportSettingsDto, @Req() req: Request) {
    return this.putSetting(admin, req, 'transport_fee', { mode: dto.mode, flatAmount: dto.mode === 'FLAT' ? dto.flatAmount! : null, notes: dto.notes ?? null });
  }

  // ───────────── Kategori layanan ─────────────

  @Get('services')
  services() {
    return this.prisma.service.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, description: true, isActive: true, sortOrder: true, _count: { select: { bookings: true, packages: { where: { deletedAt: null } } } } },
    });
  }

  @Post('services')
  async createService(@CurrentUser() admin: AuthUser, @Body() dto: ServiceDto, @Req() req: Request) {
    const base = slugify(dto.name);
    let slug = base;
    for (let i = 2; await this.prisma.service.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return this.prisma.$transaction(async (tx) => {
      const s = await tx.service.create({ data: { slug, name: dto.name, description: dto.description ?? null, sortOrder: dto.sortOrder ?? 100, isActive: dto.isActive ?? true } });
      await this.log(admin, req, 'SERVICE_CREATE', 'service', s.id, { name: s.name, slug }, tx);
      return s;
    });
  }

  @Patch('services/:id')
  async updateService(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto, @Req() req: Request) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.service.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Kategori tidak ditemukan');
      const s = await tx.service.update({ where: { id }, data: dto });
      await this.log(admin, req, 'SERVICE_UPDATE', 'service', id, { before: { name: before.name, isActive: before.isActive, description: before.description, sortOrder: before.sortOrder }, after: dto as Prisma.InputJsonValue }, tx);
      return s;
    });
  }

  // ───────────── Paket & harga ─────────────

  @Get('packages')
  packages() {
    return this.prisma.servicePackage.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: packageSelect });
  }

  private async assertService(serviceId: string | null | undefined) {
    if (serviceId && !(await this.prisma.service.findFirst({ where: { id: serviceId, deletedAt: null } }))) {
      throw new BadRequestException({ statusCode: 400, message: 'Kategori tidak ditemukan', errors: [{ field: 'serviceId', message: 'Kategori tidak ditemukan' }] });
    }
  }

  @Post('packages')
  async createPackage(@CurrentUser() admin: AuthUser, @Body() dto: PackageDto, @Req() req: Request) {
    await this.assertService(dto.serviceId);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.servicePackage.create({
        data: {
          serviceId: dto.serviceId ?? null,
          name: dto.name,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes,
          price: dto.price,
          facilities: (dto.facilities ?? []).map((f) => f.trim()).filter(Boolean),
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
        select: packageSelect,
      });
      await this.log(admin, req, 'PACKAGE_CREATE', 'service_package', p.id, { name: p.name, price: dto.price, serviceId: dto.serviceId ?? null }, tx);
      return p;
    });
  }

  @Patch('packages/:id')
  async updatePackage(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePackageDto, @Req() req: Request) {
    await this.assertService(dto.serviceId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.servicePackage.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Paket tidak ditemukan');
      const p = await tx.servicePackage.update({
        where: { id },
        data: { ...dto, ...(dto.facilities ? { facilities: dto.facilities.map((f) => f.trim()).filter(Boolean) } : {}) },
        select: packageSelect,
      });
      // Booking lama tidak berubah: harga sudah disalin (snapshot) saat booking dibuat.
      await this.log(admin, req, 'PACKAGE_UPDATE', 'service_package', id, { before: { name: before.name, price: before.price.toString(), isActive: before.isActive }, after: dto as Prisma.InputJsonValue }, tx);
      return p;
    });
  }

  @Delete('packages/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Arsipkan paket (soft delete). Booking lama tetap menyimpan snapshot harga.' })
  async deletePackage(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.servicePackage.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
      if (r.count === 0) throw new NotFoundException('Paket tidak ditemukan');
      await this.log(admin, req, 'PACKAGE_ARCHIVE', 'service_package', id, {}, tx);
    });
  }

  // ───────────── Portfolio ─────────────

  @Get('portfolio')
  async portfolio() {
    const rows = await this.prisma.portfolio.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(portfolioView);
  }

  @Post('portfolio')
  async createPortfolio(@CurrentUser() admin: AuthUser, @Body() dto: PortfolioDto, @Req() req: Request) {
    if (dto.mediaType === 'IMAGE' && (!dto.storageKey || !(await this.storage.exists(dto.storageKey)))) {
      throw new BadRequestException('Unggah foto terlebih dahulu');
    }
    if (dto.mediaType === 'VIDEO' && !dto.externalUrl && !dto.storageKey) {
      throw new BadRequestException('Masukkan tautan video (https)');
    }
    if (dto.thumbnailKey && !(await this.storage.exists(dto.thumbnailKey))) throw new BadRequestException('Thumbnail tidak ditemukan');
    const max = await this.prisma.portfolio.aggregate({ where: { deletedAt: null }, _max: { sortOrder: true } });
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.portfolio.create({
        data: {
          mediaType: dto.mediaType,
          title: dto.title ?? null,
          caption: dto.caption ?? null,
          storageKey: dto.mediaType === 'IMAGE' ? dto.storageKey : null,
          externalUrl: dto.mediaType === 'VIDEO' ? dto.externalUrl : null,
          thumbnailKey: dto.thumbnailKey ?? null,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          isActive: dto.isActive ?? true,
        },
      });
      await this.log(admin, req, 'PORTFOLIO_CREATE', 'portfolio', p.id, { mediaType: p.mediaType, title: p.title }, tx);
      return portfolioView(p);
    });
  }

  @Patch('portfolio/:id')
  async updatePortfolio(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePortfolioDto, @Req() req: Request) {
    if (dto.thumbnailKey && !(await this.storage.exists(dto.thumbnailKey))) throw new BadRequestException('Thumbnail tidak ditemukan');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.portfolio.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Konten tidak ditemukan');
      const p = await tx.portfolio.update({ where: { id }, data: dto });
      await this.log(admin, req, 'PORTFOLIO_UPDATE', 'portfolio', id, { after: dto as Prisma.InputJsonValue }, tx);
      return portfolioView(p);
    });
  }

  @Post('portfolio/reorder')
  @HttpCode(200)
  async reorder(@CurrentUser() admin: AuthUser, @Body() dto: ReorderDto, @Req() req: Request) {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.portfolio.count({ where: { id: { in: dto.ids }, deletedAt: null } });
      if (found !== new Set(dto.ids).size) throw new BadRequestException('Daftar konten tidak valid');
      for (const [i, id] of dto.ids.entries()) await tx.portfolio.update({ where: { id }, data: { sortOrder: i + 1 } });
      await this.log(admin, req, 'PORTFOLIO_REORDER', 'portfolio', 'all', { ids: dto.ids }, tx);
    });
    return this.portfolio();
  }

  @Delete('portfolio/:id')
  @HttpCode(204)
  async deletePortfolio(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.portfolio.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
      if (r.count === 0) throw new NotFoundException('Konten tidak ditemukan');
      await this.log(admin, req, 'PORTFOLIO_ARCHIVE', 'portfolio', id, {}, tx);
    });
  }
}
