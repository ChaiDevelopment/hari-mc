import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export type AuthClient = 'web' | 'android';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token (JWT) dari Google Identity Services / Credential Manager' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  idToken: string;

  @ApiProperty({ enum: ['web', 'android'], description: 'web = refresh token via httpOnly cookie; android = di body' })
  @IsIn(['web', 'android'])
  client: AuthClient;
}

export class DevLoginDto {
  @ApiProperty({ example: 'pelanggan.uji@example.com' })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @ApiProperty({ example: 'Pelanggan Uji' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: ['web', 'android'] })
  @IsOptional()
  @IsIn(['web', 'android'])
  client?: AuthClient;
}

export class EmailCodeRequestDto {
  @ApiProperty({ example: 'pelanggan@example.com' })
  @IsEmail({}, { message: 'Email tidak valid' })
  @MaxLength(160)
  email: string;
}

export class EmailCodeVerifyDto {
  @ApiProperty() @IsEmail({}, { message: 'Email tidak valid' }) @MaxLength(160) email: string;
  @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/, { message: 'Kode terdiri dari 6 angka' }) code: string;
  @ApiProperty({ enum: ['web', 'android'] }) @IsIn(['web', 'android']) client: AuthClient;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Wajib untuk Android. Web memakai cookie httpOnly.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  refreshToken?: string;
}
