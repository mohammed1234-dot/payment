import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksRepository } from './webhooks.repository.js';
import { WebhooksService } from './webhooks.service.js';
import { MailModule } from '../mail/mail.module.js';
@Module({
  imports: [StripeModule, MailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksRepository],
})
export class WebhooksModule {}
