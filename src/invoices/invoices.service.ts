import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InvoicesRepository } from './invoices.repository.js';
import type { CreateInvoiceInput } from './dto/create-invoice.dto.js';
import type { ListInvoicesInput } from './dto/list-invoices.dto.js';
import {
  toInvoiceResponse,
  toPublicInvoiceResponse,
} from './dto/invoice-response.dto.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateInvoiceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `INV-${date}-${random}`;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly invoicesRepository: InvoicesRepository) {}

  async create(userId: string, input: CreateInvoiceInput) {
    const publicToken = randomBytes(32).toString('base64url');

    const invoice = await this.invoicesRepository.create({
      userId,
      invoiceNumber: generateInvoiceNumber(),
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      expiresAt: input.expiresAt,
      publicTokenHash: hashToken(publicToken),
    });

    return { ...toInvoiceResponse(invoice), publicToken };
  }

  async list(userId: string, filters: ListInvoicesInput) {
    const { rows, total } = await this.invoicesRepository.listForUser(
      userId,
      filters,
    );

    return {
      data: rows.map((invoice) => toInvoiceResponse(invoice)),
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async findOne(userId: string, id: string) {
    const invoice = await this.invoicesRepository.findByIdForUser(id, userId);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return toInvoiceResponse(invoice);
  }

  async findPublic(token: string) {
    const invoice = await this.invoicesRepository.findByPublicTokenHash(
      hashToken(token),
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return toPublicInvoiceResponse(invoice);
  }
}
