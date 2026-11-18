import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('public')
@Controller('mc-profile')
export class McProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async get() {
    const p = await this.prisma.mcProfile.findFirst({ omit: { singleton: true } });
    if (!p) throw new NotFoundException('Profil MC belum di-seed');
    return p;
  }
}
