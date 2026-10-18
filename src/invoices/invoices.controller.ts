import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { InvoicesService } from './invoices.service.js';
import {
  createInvoiceSchema,
  type CreateInvoiceInput,
} from './dto/create-invoice.dto.js';
import {
  listInvoicesSchema,
  type ListInvoicesInput,
} from './dto/list-invoices.dto.js';

@UseGuards(AuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(
    @Req() request: { user: { id: string } },
    @Body(new ZodValidationPipe(createInvoiceSchema)) input: CreateInvoiceInput,
  ) {
    return this.invoicesService.create(request.user.id, input);
  }

  @Get()
  list(
    @Req() request: { user: { id: string } },
    @Query(new ZodValidationPipe(listInvoicesSchema))
    filters: ListInvoicesInput,
  ) {
    return this.invoicesService.list(request.user.id, filters);
  }

  @Get(':id')
  findOne(
    @Req() request: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.findOne(request.user.id, id);
  }

  @Post(':id/payment-link')
  @HttpCode(200)
  createPaymentLink(
    @Req() request: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.createPaymentLink(request.user.id, id);
  }
}
