import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { MAX_IMAGE_BYTES } from '../storage/storage.service';
import { PaymentsService } from './payments.service';

const CUSTOMER_METHODS = ['BANK_TRANSFER', 'E_WALLET', 'QRIS', 'OTHER'] as const;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SubmitPaymentDto {
  @ApiProperty({ description: 'Rupiah (bilangan bulat)' }) @Type(() => Number) @IsInt({ message: 'Nominal harus angka rupiah' }) @Min(1) @Max(1_000_000_000) amount: number;
  @ApiProperty({ enum: CUSTOMER_METHODS }) @IsIn(CUSTOMER_METHODS) method: (typeof CUSTOMER_METHODS)[number];
  @ApiProperty({ example: '2027-01-10' }) @IsDateString({}, { message: 'Tanggal pembayaran tidak valid' }) paidAt: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class ManualPaymentDto {
  @ApiProperty() @IsInt({ message: 'Nominal harus angka rupiah' }) @Min(1) @Max(1_000_000_000) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsIn(Object.values(PaymentMethod)) method: PaymentMethod;
  @ApiProperty() @IsDateString({}, { message: 'Tanggal pembayaran tidak valid' }) paidAt: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) notes?: string;
}

export class RejectPaymentDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500, { message: 'Alasan 5–500 karakter' }) reason: string;
}

function sendProof(res: Response, file: { stream: NodeJS.ReadableStream; size: number; mimeType: string }) {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  file.stream.pipe(res);
}

/** Pelanggan: kirim & lihat bukti pembayaran pesanannya sendiri. */
@ApiTags('bookings (customer)')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('bookings/:bookingId/payments')
export class CustomerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, amount: { type: 'integer' }, method: { type: 'string' }, paidAt: { type: 'string' }, notes: { type: 'string' } } } })
  @ApiOperation({ summary: 'Kirim bukti pembayaran (foto/PDF, maks. 5 MB) — menunggu verifikasi Hari Susanto' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 8 } }))
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: SubmitPaymentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    await this.payments.submitProof(user, bookingId, dto, file, requestMeta(req));
    return { ok: true };
  }

  @Get(':paymentId/proof')
  @ApiOperation({ summary: 'Lihat bukti pembayaran sendiri' })
  async proof(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Res() res: Response) {
    sendProof(res, await this.payments.proofFor(paymentId, { customerId: user.id, bookingId }));
  }
}

/** Admin: verifikasi, tolak, catat manual, lihat bukti. */
@ApiTags('admin / payments')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/:id/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verifikasi pembayaran; otomatis TERKONFIRMASI bila DP/total terpenuhi' })
  async verify(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return { bookingId: await this.payments.verify(admin, id, requestMeta(req)) };
  }

  @Post('payments/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tolak bukti pembayaran dengan alasan (pelanggan dapat mengirim ulang)' })
  async reject(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPaymentDto, @Req() req: Request) {
    return { bookingId: await this.payments.reject(admin, id, dto.reason, requestMeta(req)) };
  }

  @Post('bookings/:id/payments')
  @ApiOperation({ summary: 'Catat pembayaran yang diterima langsung (mis. tunai) — langsung terverifikasi' })
  async record(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualPaymentDto, @Req() req: Request) {
    return { bookingId: await this.payments.recordManual(admin, id, dto, requestMeta(req)) };
  }

  @Get('payments/:id/proof')
  @ApiOperation({ summary: 'Lihat bukti pembayaran' })
  async proof(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendProof(res, await this.payments.proofFor(id, {}));
  }
}
