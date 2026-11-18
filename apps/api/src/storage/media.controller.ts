import { BadRequestException, Controller, Get, NotFoundException, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requestMeta } from '../common/request-meta';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage, StorageService } from './storage.service';

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** File publik (foto profil & portfolio) — hanya key yang dibuat server yang dapat dibaca. */
@ApiTags('public')
@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @SkipThrottle()
  @Get(':key')
  get(@Param('key') key: string, @Res() res: Response) {
    const file = this.storage.open(key);
    if (!file) throw new NotFoundException();
    res.setHeader('Content-Type', CONTENT_TYPE[key.split('.').pop()!]);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', 'inline');
    file.stream.pipe(res);
  }
}

@ApiTags('admin / media')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/media')
export class AdminMediaController {
  constructor(
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }))
  async upload(@CurrentUser() admin: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    if (!file) throw new BadRequestException('File wajib diunggah (field "file")');
    const mime = sniffImage(file.buffer);
    if (!mime) throw new BadRequestException(`Format tidak didukung. Gunakan ${Object.values(IMAGE_TYPES).join(', ').toUpperCase()} (maks. 5 MB)`);
    const saved = await this.storage.saveImage(file.buffer, mime);
    await this.audit.log({
      actorUserId: admin.id,
      actorType: 'ADMIN',
      action: 'MEDIA_UPLOAD',
      entityType: 'media',
      entityId: saved.key,
      metadata: { mime, size: file.size, originalName: file.originalname.slice(0, 200) },
      meta: requestMeta(req),
    });
    return { ...saved, mimeType: mime, sizeBytes: file.size };
  }
}
