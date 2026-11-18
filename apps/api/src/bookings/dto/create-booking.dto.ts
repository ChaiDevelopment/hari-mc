import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_TIMEZONES } from '../schedule';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndef = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};

export class CreateBookingDto {
  // ── Data pemesan
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 120) contactName: string;
  @ApiProperty() @Transform(trim) @IsEmail({}, { message: 'Email tidak valid' }) @MaxLength(160) contactEmail: string;
  @ApiProperty({ example: '081234567890' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(/^(\+?62|0)8[0-9]{7,12}$/, { message: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' })
  contactWhatsapp: string;

  // ── Data acara
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 150) eventName: string;
  @ApiProperty() @IsUUID('4', { message: 'Kategori acara tidak valid' }) serviceId: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsUUID('4', { message: 'Paket tidak valid' }) packageId?: string;
  @ApiProperty({ example: '2027-01-15' }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal YYYY-MM-DD' }) eventDate: string;
  @ApiProperty({ example: '10:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Format jam HH:mm' }) startTime: string;
  @ApiProperty({ example: '12:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Format jam HH:mm' }) endTime: string;
  @ApiProperty({ enum: Object.keys(SUPPORTED_TIMEZONES) }) @IsIn(Object.keys(SUPPORTED_TIMEZONES), { message: 'Zona waktu tidak didukung' }) timezone: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 150) venueName: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500) address: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) city: string;
  @ApiPropertyOptional()
  @Transform(emptyToUndef)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Link Google Maps harus diawali https://' })
  @MaxLength(500)
  mapsUrl?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) guestCount?: number;

  // ── Kebutuhan MC
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(2000) concept?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(100) language?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(200) dressCode?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(5000) rundown?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(2000) activityDescription?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(2000) specialRequests?: string;
  @ApiPropertyOptional() @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(2000) additionalNotes?: string;

  /** Jawaban pertanyaan tambahan (divalidasi terhadap business_settings.booking_form.extraQuestions). */
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsObject() formAnswers?: Record<string, unknown>;

  // ── Persetujuan
  @ApiProperty({ description: 'Wajib true: menyetujui kebijakan privasi' })
  @Equals(true, { message: 'Anda harus menyetujui kebijakan privasi' })
  privacyConsent: boolean;

  @ApiProperty({ description: 'Wajib true: menyatakan data sudah benar' })
  @Equals(true, { message: 'Konfirmasi bahwa data sudah benar' })
  dataConfirmed: boolean;
}

export class CancelBookingDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 500, { message: 'Alasan pembatalan 5–500 karakter' }) reason: string;
}
