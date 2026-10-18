import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InvoicesService } from './invoices.service.js';

@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  findOne(@Param('token') token: string) {
    return this.invoicesService.findPublic(token);
  }
}
