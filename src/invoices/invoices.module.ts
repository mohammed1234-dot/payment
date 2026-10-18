import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesRepository } from './invoices.repository.js';
import { InvoicesService } from './invoices.service.js';
import { PublicInvoicesController } from './public-invoices.controller.js';

@Module({
  controllers: [InvoicesController, PublicInvoicesController],
  providers: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
