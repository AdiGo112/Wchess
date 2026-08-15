import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseCorsOrigin } from './common/utils/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  const corsOrigin = parseCorsOrigin();
  if (corsOrigin === true) {
    console.warn(
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
  console.log(`WChess backend running on http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/api/docs`);
}

bootstrap();
