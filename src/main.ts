import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
