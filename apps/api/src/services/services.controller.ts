import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('public')
@Controller('services')
export class ServicesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Kategori layanan aktif + paket aktif (harga berasal dari CMS, bukan hardcode). */
  @Public()
  @Get()
  list() {
    return this.prisma.service.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        packages: {
          where: { isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
            currency: true,
            facilities: true,
          },
        },
      },
    });
  }
}
