import { Global, Module } from '@nestjs/common';
import { AdminMediaController, MediaController } from './media.controller';
import { StorageService } from './storage.service';

@Global()
@Module({ providers: [StorageService], controllers: [MediaController, AdminMediaController], exports: [StorageService] })
export class StorageModule {}
