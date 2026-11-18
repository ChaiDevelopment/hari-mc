import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** "" → null agar field opsional bisa dikosongkan. */
const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
const HTTPS = { protocols: ['https'], require_protocol: true };
const MEDIA_OR_HTTPS = /^(\/api\/v1\/media\/[0-9a-f-]{36}\.(jpg|png|webp)|https:\/\/\S+)$/;

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 120) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 150) businessName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) tagline?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) bio?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200) locationLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @Matches(MEDIA_OR_HTTPS, { message: 'Foto harus hasil unggahan atau URL https' }) photoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsUrl(HTTPS, { message: 'URL Instagram harus https://' }) @Matches(/^https:\/\/(www\.)?instagram\.com\//, { message: 'Harus tautan instagram.com' }) instagramUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') || null : value)) @ValidateIf((_, v) => v !== null) @Matches(/^[A-Za-z0-9._]{1,30}$/, { message: 'Username Instagram tidak valid' }) instagramHandle?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsUrl(HTTPS, { message: 'URL Google Maps harus https://' }) @Matches(/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/, { message: 'Harus tautan Google Maps' }) googleMapsUrl?: string | null;
  @ApiPropertyOptional({ example: '081234567890' }) @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') || null : value)) @ValidateIf((_, v) => v !== null) @Matches(/^(\+?62|0)8[0-9]{7,12}$/, { message: 'Nomor WhatsApp tidak valid' }) whatsappNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsEmail({}, { message: 'Email tidak valid' }) contactEmail?: string | null;
}

export class BookingRulesDto {
  @ApiProperty() @IsInt() @Min(0) @Max(480) travelBufferMinutes: number;
  @ApiProperty() @IsInt() @Min(0) @Max(720) minLeadTimeHours: number;
  @ApiProperty() @IsInt() @Min(1) @Max(730) maxAdvanceDays: number;
}

export class BankAccountDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 60) bankName: string;
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value)) @Matches(/^\d{5,25}$/, { message: 'Nomor rekening hanya angka (5–25 digit)' }) accountNumber: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 100) accountHolder: string;
}

export class PaymentSettingsDto {
  @ApiProperty({ enum: ['UNSET', 'PERCENT', 'FIXED'], description: 'UNSET = belum dikonfigurasi' })
  @IsIn(['UNSET', 'PERCENT', 'FIXED']) depositType: 'UNSET' | 'PERCENT' | 'FIXED';

  @ApiPropertyOptional({ description: 'PERCENT: 1–100. FIXED: rupiah > 0.' })
  @ValidateIf((o) => o.depositType !== 'UNSET') @IsInt() @Min(1) @Max(1_000_000_000) depositValue?: number;

  @ApiProperty({ type: [BankAccountDto] }) @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => BankAccountDto) bankAccounts: BankAccountDto[];
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) instructions?: string | null;
}

export class TransportSettingsDto {
  @ApiProperty({ enum: ['UNSET', 'FLAT', 'PER_BOOKING'], description: 'UNSET = belum dikonfigurasi; PER_BOOKING = ditentukan per pesanan' })
  @IsIn(['UNSET', 'FLAT', 'PER_BOOKING']) mode: 'UNSET' | 'FLAT' | 'PER_BOOKING';
  @ApiPropertyOptional() @ValidateIf((o) => o.mode === 'FLAT') @IsInt() @Min(1) @Max(1_000_000_000) flatAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) notes?: string | null;
}

export class GoogleReviewsSettingsDto {
  @ApiPropertyOptional({ description: 'Place ID Google (mis. ChIJ...). Kosong/null = gunakan tautan Google Maps' })
  @IsOptional()
  @Transform(blankToNull)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Za-z0-9_-]{10,300}$/, { message: 'Place ID tidak valid (contoh: ChIJ...)' })
  placeId?: string | null;
}

export class ServiceDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PackageDto {
  @ApiPropertyOptional({ description: 'null = berlaku untuk semua kategori' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4') serviceId?: string | null;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 100) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) description?: string | null;
  @ApiProperty() @IsInt() @Min(15) @Max(1440) durationMinutes: number;
  @ApiProperty({ description: 'Rupiah, bilangan bulat > 0' }) @IsInt({ message: 'Harga harus bilangan bulat rupiah' }) @Min(1, { message: 'Harga harus lebih dari 0' }) @Max(1_000_000_000) price: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 120, { each: true }) facilities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePackageDto {
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('4') serviceId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(2, 100) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(15) @Max(1440) durationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt({ message: 'Harga harus bilangan bulat rupiah' }) @Min(1) @Max(1_000_000_000) price?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(1, 120, { each: true }) facilities?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PortfolioDto {
  @ApiProperty({ enum: MediaType }) @IsEnum(MediaType) mediaType: MediaType;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(150) title?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) caption?: string | null;
  @ApiPropertyOptional({ description: 'Key hasil POST /admin/media (untuk IMAGE)' }) @IsOptional() @Matches(/^[0-9a-f-]{36}\.(jpg|png|webp)$/) storageKey?: string;
  @ApiPropertyOptional({ description: 'Tautan https video (YouTube/Instagram) untuk VIDEO' }) @IsOptional() @IsUrl(HTTPS, { message: 'Tautan harus https://' }) @MaxLength(500) externalUrl?: string;
  @ApiPropertyOptional({ description: 'Key gambar thumbnail (opsional)' }) @IsOptional() @Matches(/^[0-9a-f-]{36}\.(jpg|png|webp)$/) thumbnailKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePortfolioDto {
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(150) title?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) caption?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^[0-9a-f-]{36}\.(jpg|png|webp)$/) thumbnailKey?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) ids: string[];
}
