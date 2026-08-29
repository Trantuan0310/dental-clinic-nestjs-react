import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
// `compression` is exported as a CommonJS function without an ES default export,
// so importing the default yields `undefined` at runtime. Use `require` to get
// the real middleware factory while preserving typings via the type-only import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require('compression') as () => express.RequestHandler;
import type express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers first — must run before any response is written.
  app.use(helmet());
  app.use(compression());

  // Graceful shutdown so Prisma/Redis connections close cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global API prefix — applies to every route so endpoints are exposed under
  // /api/v1/* (the versioning layer still appends the `/v1` segment).
  // Exclude health, docs and the brand preview from the API prefix.
  app.setGlobalPrefix('api', {
    exclude: ['health', 'docs/(.*)', '__brand-preview'],
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Dental Clinic Management API')
      .setDescription('API for Dental Clinic Management System')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refreshToken')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  Logger.log(`Application is running on: http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`Swagger documentation: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
