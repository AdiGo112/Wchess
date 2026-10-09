import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseCorsOrigin } from './common/utils/cors';
import { applyHttpSecurity } from './common/http-security';

async function bootstrap() {
  // Buffer boot logs until pino is wired, so even startup lines come out as JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  applyHttpSecurity(app);

  app.setGlobalPrefix('api/v1');

  const corsOrigin = parseCorsOrigin();
  if (corsOrigin === true) {
    logger.warn(
      '[SECURITY] CORS_ORIGIN=* — every requesting origin is reflected back ' +
        'with credentials:true, so any site can read authenticated API ' +
        'responses. Intended for throwaway tunnel demos only. Set CORS_ORIGIN ' +
        'to an explicit origin (or a comma-separated list) before deploying.',
    );
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Unknown fields are a client bug or a probe: reject them rather than drop them silently.
      forbidNonWhitelisted: true,
    }),
  );

  // A public API map helps attackers more than users: dev only.
  const docs = process.env.NODE_ENV !== 'production';
  if (docs) {
    const config = new DocumentBuilder()
      .setTitle('WChess API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 3100;
  await app.listen(port);
  logger.log(`WChess backend running on http://localhost:${port}${docs ? ' (API docs: /api/docs)' : ''}`);
}

bootstrap();
