import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIndonesianPhone } from './phone';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateCustomerProfileDto {
  @IsOptional() @Transform(trim) @IsString() @Length(2, 120) name?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^(\+?62|0)8[0-9]{7,12}$/, { message: 'Nomor WhatsApp tidak valid (contoh: 081234567890)' })
  whatsapp?: string;

  @IsOptional() @Transform(trim) @IsString() @Length(2, 80) city?: string;
}

@ApiTags('me')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('me')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('profile')
  async profile(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { customerProfile: true } });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      whatsapp: user.customerProfile?.whatsapp ?? null,
      city: user.customerProfile?.city ?? null,
    };
  }

  @Patch('profile')
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateCustomerProfileDto, @Req() req: Request) {
    const whatsapp = dto.whatsapp ? normalizeIndonesianPhone(dto.whatsapp) : undefined;
    await this.prisma.$transaction(async (tx) => {
      if (dto.name) await tx.user.update({ where: { id: u.id }, data: { name: dto.name } });
      await tx.customerProfile.upsert({
        where: { userId: u.id },
        create: { userId: u.id, whatsapp, city: dto.city },
        update: { whatsapp, city: dto.city },
      });
      await this.audit.log(
        {
          actorUserId: u.id,
          actorType: 'CUSTOMER',
          action: 'PROFILE_UPDATE',
          entityType: 'user',
          entityId: u.id,
          meta: requestMeta(req),
        },
        tx,
      );
    });
    return this.profile(u);
  }
}
