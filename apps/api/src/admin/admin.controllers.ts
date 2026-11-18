import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminBookingQuery, CalendarQuery, CustomerQuery, PricingDto, RequestChangesDto, TransitionDto } from './dto/admin-bookings.dto';

/** Semua controller di file ini: hanya ADMIN (dicek server dari DB pada setiap request oleh AuthGuard + RolesGuard). */

@ApiTags('admin / dashboard')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Statistik & agenda dari data nyata' })
  get(@CurrentUser() admin: AuthUser) {
    return this.overview.dashboard(admin.id);
  }
}

@ApiTags('admin / bookings')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookings: AdminBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar booking + pencarian, filter, paginasi, dan jumlah per status' })
  list(@Query() q: AdminBookingQuery) {
    return this.bookings.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail booking lengkap + transisi yang diizinkan + konflik jadwal' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.detail(id);
  }

  @Post(':id/transition')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ubah status sesuai aturan transisi (terima, tolak, minta bayar, konfirmasi, mulai, selesai, batal, refund)' })
  transition(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto, @Req() req: Request) {
    return this.bookings.transition(admin, id, dto, requestMeta(req));
  }

  @Post(':id/request-changes')
  @HttpCode(200)
  @ApiOperation({ summary: 'Minta perubahan jadwal/informasi ke pelanggan (status tidak berubah)' })
  requestChanges(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestChangesDto, @Req() req: Request) {
    return this.bookings.requestChanges(admin, id, dto.message, requestMeta(req));
  }

  @Patch(':id/pricing')
  @ApiOperation({ summary: 'Tetapkan rincian biaya (total dihitung server)' })
  pricing(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PricingDto, @Req() req: Request) {
    return this.bookings.updatePricing(admin, id, dto, requestMeta(req));
  }
}

@ApiTags('admin / calendar')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/calendar')
export class AdminCalendarController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Event kalender dalam rentang + penanda bentrok & jeda perjalanan' })
  get(@Query() q: CalendarQuery) {
    return this.overview.calendar(q);
  }
}

@ApiTags('admin / customers')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  list(@Query() q: CustomerQuery) {
    return this.overview.customers(q);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.overview.customer(id);
  }
}
