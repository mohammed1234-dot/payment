import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/mail/mail.service.js';
import { StripeService } from '../src/stripe/stripe.service.js';

export function createMailMock() {
  return {
    sendPaymentSucceeded: vi.fn(),
    sendPaymentFailed: vi.fn(),
    sendImportCompleted: vi.fn(),
    sendImportFailed: vi.fn(),
  };
}

export async function createTestApp(
  stripeMock?: object,
  mailMock: object = createMailMock(),
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (stripeMock) {
    builder.overrideProvider(StripeService).useValue(stripeMock);
  }
  builder.overrideProvider(MailService).useValue(mailMock);

  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  return app;
}
