import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

function ctx(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(meta: Record<string, unknown>) {
  const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('mengizinkan role yang sesuai', () => {
    expect(guardWith({ [ROLES_KEY]: ['ADMIN'] }).canActivate(ctx({ role: 'ADMIN' }))).toBe(true);
  });
  it('menolak customer di endpoint admin', () => {
    expect(() => guardWith({ [ROLES_KEY]: ['ADMIN'] }).canActivate(ctx({ role: 'CUSTOMER' }))).toThrow(ForbiddenException);
  });
  it('menolak jika user tidak ada', () => {
    expect(() => guardWith({ [ROLES_KEY]: ['ADMIN'] }).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
  it('endpoint tanpa @Roles boleh untuk semua user yang login', () => {
    expect(guardWith({}).canActivate(ctx({ role: 'CUSTOMER' }))).toBe(true);
  });
  it('endpoint @Public dilewati', () => {
    expect(guardWith({ [IS_PUBLIC_KEY]: true, [ROLES_KEY]: ['ADMIN'] }).canActivate(ctx(undefined))).toBe(true);
  });
});
