import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseCorsOrigin } from './common/utils/cors';

async function bootstrap() {
  // Buffer boot logs until pino is wired, so even startup lines come out as JSON.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

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
      forbidNonWhitelisted: false,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('WChess API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3100;
  await app.listen(port);
  logger.log(`WChess backend running on http://localhost:${port} (API docs: /api/docs)`);
}

bootstrap();
