import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value);

export class AdminBookingQuery {
  @ApiPropertyOptional({ description: 'Cari nomor booking, nama, email, WhatsApp, atau nama acara' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;

  @ApiPropertyOptional({ description: 'Status dipisah koma, mis. PENDING,ACCEPTED' })
  @IsOptional() @Transform(csv) @IsArray() @IsEnum(BookingStatus, { each: true }) status?: BookingStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID('4') serviceId?: string;
  @ApiPropertyOptional({ example: '2027-01-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @ApiPropertyOptional({ example: '2027-01-31' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;
  @ApiPropertyOptional({ enum: ['created_desc', 'event_asc', 'event_desc'] }) @IsOptional() @IsIn(['created_desc', 'event_asc', 'event_desc']) sort: 'created_desc' | 'event_asc' | 'event_desc' = 'created_desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class TransitionDto {
  @ApiProperty({ enum: BookingStatus }) @IsEnum(BookingStatus) toStatus: BookingStatus;

  @ApiPropertyOptional({ enum: BookingStatus, description: 'Status yang dilihat admin; jika berbeda dengan DB → 409 (mencegah aksi atas data basi)' })
  @IsOptional() @IsEnum(BookingStatus) expectedStatus?: BookingStatus;

  @ApiPropertyOptional({ description: 'Catatan/alasan. Wajib untuk REJECTED dan CANCELLED.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}

export class RequestChangesDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 1000, { message: 'Pesan 5–1000 karakter' }) message: string;
}

const MAX_RUPIAH = 1_000_000_000; // Rp 1 miliar per komponen — batas kewajaran input

export class PricingDto {
  @ApiProperty() @IsInt({ message: 'Harga paket harus bilangan bulat rupiah' }) @Min(0) @Max(MAX_RUPIAH) packagePrice: number;
  @ApiProperty() @IsInt({ message: 'Biaya transportasi harus bilangan bulat rupiah' }) @Min(0) @Max(MAX_RUPIAH) transportFee: number;
  @ApiProperty() @IsInt({ message: 'Biaya tambahan harus bilangan bulat rupiah' }) @Min(0) @Max(MAX_RUPIAH) additionalFee: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) additionalFeeNote?: string;
  @ApiProperty() @IsInt({ message: 'Diskon harus bilangan bulat rupiah' }) @Min(0) @Max(MAX_RUPIAH) discountAmount: number;
  @ApiProperty() @IsInt({ message: 'DP harus bilangan bulat rupiah' }) @Min(0) @Max(MAX_RUPIAH) depositAmount: number;
}

export class CalendarQuery {
  @ApiProperty({ example: '2027-01-01T00:00:00+07:00' }) @IsString() from: string;
  @ApiProperty({ example: '2027-02-01T00:00:00+07:00' }) @IsString() to: string;
  @ApiPropertyOptional({ description: 'Status dipisah koma' })
  @IsOptional() @Transform(csv) @IsArray() @IsEnum(BookingStatus, { each: true }) status?: BookingStatus[];
}

export class CustomerQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
