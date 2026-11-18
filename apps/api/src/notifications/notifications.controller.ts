import { Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class NotificationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}

/** Notification center — berlaku untuk customer maupun admin, selalu dibatasi ke user yang login. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: NotificationQuery) {
    return this.notifications.list(u.id, q.page, q.pageSize);
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) {
    return { updated: await this.notifications.markAllRead(u.id) };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.notifications.markRead(u.id, id))) throw new NotFoundException('Notifikasi tidak ditemukan');
  }
}
