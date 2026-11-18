import { Module } from '@nestjs/common';
import { McProfileController } from './mc-profile.controller';

@Module({ controllers: [McProfileController] })
export class McProfileModule {}
