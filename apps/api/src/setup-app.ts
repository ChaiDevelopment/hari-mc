import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { CSRF_HEADER } from './auth/token.util';
import { ENV, type Env } from './config/env';

/** Konfigurasi bersama untuk runtime dan e2e test. */
export function setupApp(app: INestApplication): Env {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;

  if (env.TRUST_PROXY > 0) express.set('trust proxy', env.TRUST_PROXY);
  express.disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', CSRF_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Hari MC Booking API')
      .setDescription('REST API untuk Customer Web, Android, dan Admin CMS Hari Susanto')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  return env;
}
