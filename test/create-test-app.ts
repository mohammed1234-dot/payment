import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { StripeService } from '../src/stripe/stripe.service.js';

export async function createTestApp(
  stripeMock?: object,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (stripeMock) {
    builder.overrideProvider(StripeService).useValue(stripeMock);
  }

  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  return app;
}
