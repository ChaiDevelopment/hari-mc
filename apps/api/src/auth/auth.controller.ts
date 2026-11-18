import {
  Body,
  CanActivate,
  Controller,
  Injectable,
  UseGuards,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { requestMeta } from '../common/request-meta';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, toPublicUser, type IssuedTokens } from './auth.service';
import { DevLoginDto, EmailCodeRequestDto, EmailCodeVerifyDto, GoogleLoginDto, RefreshDto, type AuthClient } from './dto/auth.dto';
import { EmailLoginService } from './email-login.service';
import { CSRF_HEADER, REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './token.util';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Dev login nonaktif → 404 sebelum validasi body, sehingga keberadaan endpoint tidak terlihat. */
@Injectable()
class DevLoginEnabledGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}
  canActivate(): boolean {
    if (!this.env.ENABLE_DEV_LOGIN || this.env.NODE_ENV === 'production') throw new NotFoundException();
    return true;
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly emailLogin: EmailLoginService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private cookieOptions(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      domain: this.env.COOKIE_DOMAIN,
      expires,
    };
  }

  /** Web: refresh token di cookie httpOnly (tidak dikembalikan di body). Android: di body. */
  private respond(res: Response, client: AuthClient, t: IssuedTokens) {
    const body = { accessToken: t.accessToken, accessTokenExpiresIn: t.accessTokenExpiresIn, user: t.user };
    if (client === 'web') {
      res.cookie(REFRESH_COOKIE, t.refreshToken, this.cookieOptions(t.refreshTokenExpiresAt));
      return body;
    }
    return { ...body, refreshToken: t.refreshToken, refreshTokenExpiresAt: t.refreshTokenExpiresAt };
  }

  /** Request yang memakai cookie wajib menyertakan header custom (CSRF defense; tidak bisa dikirim lintas situs tanpa izin CORS). */
  private assertCsrf(req: Request) {
    if (req.headers[CSRF_HEADER] !== '1') throw new ForbiddenException('Header CSRF tidak ada');
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login/registrasi dengan Google ID token (customer & admin)' })
  async google(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.loginWithGoogle(dto.idToken, requestMeta(req));
    return this.respond(res, dto.client, tokens);
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Konfigurasi login publik untuk klien (Client ID Google bersifat publik)' })
  config() {
    return {
      googleClientId: this.env.GOOGLE_CLIENT_IDS[0] ?? null,
      devLoginEnabled: this.env.ENABLE_DEV_LOGIN && this.env.NODE_ENV !== 'production',
      devAdminLoginEnabled: this.env.ENABLE_DEV_ADMIN_LOGIN && this.env.ENABLE_DEV_LOGIN && this.env.NODE_ENV !== 'production',
      emailLoginEnabled: this.emailLogin.available,
      /** true hanya di development tanpa SMTP: kode tidak dikirim, melainkan ditulis ke kotak surat lokal server. */
      emailDevMailbox: this.env.EMAIL_TRANSPORT === 'log' && this.env.NODE_ENV !== 'production',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('email/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Kirim kode masuk 6 digit ke email (masuk/daftar tanpa password)' })
  requestEmailCode(@Body() dto: EmailCodeRequestDto, @Req() req: Request) {
    return this.emailLogin.requestCode(dto.email, requestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verifikasi kode email → sesi login (akun pelanggan dibuat otomatis bila baru)' })
  async verifyEmailCode(@Body() dto: EmailCodeVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { isNewUser, ...tokens } = await this.emailLogin.verifyCode(dto.email, dto.code, requestMeta(req));
    return { ...this.respond(res, dto.client, tokens), isNewUser };
  }

  @Public()
  @UseGuards(DevLoginEnabledGuard)
  @Throttle(AUTH_THROTTLE)
  @Post('dev-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'HANYA development: login customer tanpa Google (ENABLE_DEV_LOGIN=true)' })
  async devLogin(@Body() dto: DevLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!this.env.ENABLE_DEV_LOGIN || this.env.NODE_ENV === 'production') throw new NotFoundException();
    const tokens = await this.auth.loginDev(dto.email, dto.name, requestMeta(req));
    return this.respond(res, dto.client ?? 'web', tokens);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiHeader({ name: CSRF_HEADER, required: false, description: 'Wajib "1" jika memakai cookie (web)' })
  @ApiOperation({ summary: 'Rotasi refresh token; token lama tidak bisa dipakai lagi' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (dto.refreshToken) {
      return this.respond(res, 'android', await this.auth.refresh(dto.refreshToken, requestMeta(req)));
    }
    const cookie: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!cookie) throw new UnauthorizedException('Sesi tidak ditemukan');
    this.assertCsrf(req);
    try {
      return this.respond(res, 'web', await this.auth.refresh(cookie, requestMeta(req)));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cabut sesi saat ini (refresh token family)' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie: string | undefined = req.cookies?.[REFRESH_COOKIE];
    const token = dto.refreshToken ?? cookie;
    if (!dto.refreshToken && cookie) this.assertCsrf(req);
    if (token) await this.auth.logoutByRefreshToken(token, requestMeta(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User yang sedang login' })
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.id },
      include: { customerProfile: true, adminProfile: true },
    });
    return {
      ...toPublicUser(user),
      customerProfile: user.customerProfile
        ? { whatsapp: user.customerProfile.whatsapp, city: user.customerProfile.city }
        : null,
      adminProfile: user.adminProfile ? { displayName: user.adminProfile.displayName } : null,
    };
  }
}
