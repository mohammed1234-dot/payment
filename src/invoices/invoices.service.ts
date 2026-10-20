import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import type { Invoice } from '../database/schema/index.js';
import { InvoiceStatus } from '../database/schema/invoice-status.js';
import { StripeService } from '../stripe/stripe.service.js';
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
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
    private readonly stripeService: StripeService,
  ) {}

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

  findBySession(sessionId: string) {
    return this.invoicesRepository.findBySessionId(sessionId);
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

  async createPaymentLink(userId: string, id: string) {
    const invoice = await this.invoicesRepository.findByIdForUser(id, userId);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.getCheckoutUrl(invoice);
  }

  async createPublicCheckout(token: string) {
    const invoice = await this.invoicesRepository.findByPublicTokenHash(
      hashToken(token),
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.getCheckoutUrl(invoice);
  }

  private async getCheckoutUrl(invoice: Invoice) {
    if (invoice.status !== InvoiceStatus.Pending) {
      throw new ConflictException(`Invoice is ${invoice.status}`);
    }

    if (invoice.expiresAt && invoice.expiresAt <= new Date()) {
      await this.invoicesRepository.markExpired(invoice.id);
      throw new ConflictException('Invoice is expired');
    }

    try {
      if (invoice.stripeCheckoutSessionId) {
        const current = await this.stripeService.getCheckoutSession(
          invoice.stripeCheckoutSessionId,
        );

        if (current.status === 'open' && current.url) {
          return { url: current.url };
        }

        if (current.status === 'complete') {
          throw new ConflictException('Invoice payment is being processed');
        }
      }

      const session = await this.stripeService.createCheckoutSession(invoice);

      await this.invoicesRepository.saveCheckoutSession(invoice, session.id);

      return { url: session.url };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        throw new BadGatewayException('Payment provider error');
      }

      throw error;
    }
  }
}
