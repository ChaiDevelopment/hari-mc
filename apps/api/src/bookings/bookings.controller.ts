import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { BookingsService, type ListScope } from './bookings.service';
import { CancelBookingDto, CreateBookingDto } from './dto/create-booking.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ListBookingsQuery {
  @IsOptional() @IsIn(['upcoming', 'past', 'all']) scope: ListScope = 'all';
  @IsOptional() @IsEnum(BookingStatus) status?: BookingStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 10;
}

/** Endpoint booking customer. Semua query dibatasi ke booking milik user yang login. */
@ApiTags('bookings (customer)')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID unik per sesi form; submit ulang dengan key sama tidak membuat booking ganda' })
  @ApiOperation({ summary: 'Kirim pesanan baru (status PENDING)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key || !UUID_RE.test(key)) throw new BadRequestException('Header Idempotency-Key (UUID) wajib disertakan');
    const { booking, replay } = await this.bookings.create(user, dto, key.toLowerCase(), requestMeta(req));
    res.status(replay ? 200 : 201);
    if (replay) res.setHeader('Idempotent-Replay', 'true');
    return booking;
  }

  @Get()
  @ApiOperation({ summary: 'Riwayat pesanan saya' })
  list(@CurrentUser() user: AuthUser, @Query() q: ListBookingsQuery) {
    return this.bookings.listForCustomer(user.id, q);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Ringkasan untuk dashboard customer' })
  summary(@CurrentUser() user: AuthUser) {
    return this.bookings.summaryForCustomer(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail & timeline status pesanan saya' })
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.getForCustomer(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Batalkan pesanan (hanya PENDING / ACCEPTED / WAITING_PAYMENT)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto, @Req() req: Request) {
    return this.bookings.cancelByCustomer(user, id, dto.reason, requestMeta(req));
  }
}
