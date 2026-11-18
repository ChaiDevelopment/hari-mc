import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.useBodyParser('json', { limit: '1mb' });
  const env = setupApp(app);
  await app.listen(env.PORT);
  Logger.log(`API berjalan di http://localhost:${env.PORT}/api/v1 (docs: /api/docs)`, 'Bootstrap');
}

void bootstrap();
