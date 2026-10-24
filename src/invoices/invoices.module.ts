import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { PaymentPagesController } from './payment-pages.controller.js';
import { PublicInvoicesController } from './public-invoices.controller.js';

@Module({
  imports: [StripeModule],
  controllers: [
    InvoicesController,
    PublicInvoicesController,
    PaymentPagesController,
  ],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService],
})
export class InvoicesModule {}
