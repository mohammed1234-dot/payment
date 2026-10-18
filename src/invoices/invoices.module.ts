import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { PublicInvoicesController } from './public-invoices.controller.js';

@Module({
  imports: [StripeModule],
  controllers: [InvoicesController, PublicInvoicesController],
  providers: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
