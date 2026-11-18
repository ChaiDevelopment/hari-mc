import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SiteController } from './site.controller';

@Global()
@Module({ providers: [SettingsService], controllers: [SiteController], exports: [SettingsService] })
export class SettingsModule {}
