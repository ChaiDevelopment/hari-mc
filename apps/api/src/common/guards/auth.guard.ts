import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string; // refresh-token family id (sesi)
}

/**
 * Guard global. Semua endpoint wajib Bearer access token kecuali @Public().
 * User dan sesi dimuat ulang dari DB pada setiap request sehingga suspend/logout berlaku seketika.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Login diperlukan');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
        issuer: 'hari-mc-api',
        audience: 'hari-mc-clients',
      });
    } catch {
      throw new UnauthorizedException('Sesi tidak valid atau kedaluwarsa');
    }

    const [user, activeSession] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub } }),
      this.prisma.refreshToken.findFirst({
        where: { familyId: payload.sid, userId: payload.sub, revokedAt: null },
        select: { id: true },
      }),
    ]);
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.role !== payload.role || !activeSession) {
      throw new UnauthorizedException('Sesi tidak valid');
    }

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role, sessionId: payload.sid };
    return true;
  }
}
