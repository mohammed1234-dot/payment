import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  // rawBody keeps the exact request bytes on req.rawBody next to the parsed JSON.
  // The Stripe webhook needs them to verify its signature; other routes ignore them.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Every route is served under /v1 (e.g. /v1/health).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties that have no decorator in the DTO
      forbidNonWhitelisted: true, // and reject the request when any are sent
      transform: true, // turn the payload into the DTO class (and query strings into numbers)
    }),
  );


  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
