import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentStatus } from '../database/schema/payment-status.js';
import { WebhookEventStatus } from '../database/schema/webhook-events-status.js';
import { StripeService } from '../stripe/stripe.service.js';
import { WebhooksRepository } from './webhooks.repository.js';
import { MailService} from '../mail/mail.service.js';
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly webhooksRepository: WebhooksRepository,
    private readonly mailService: MailService,
  ) {}

  async handleStripeEvent(rawBody?: Buffer, signature?: string) {
    if (!rawBody || !signature) {
      throw new BadRequestException('Invalid signature');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid signature');
    }

    const saved = await this.webhooksRepository.findEvent(event.id);
    if (saved?.status === WebhookEventStatus.Processed) {
      return;
    }
    if (!saved) {
      await this.webhooksRepository.saveEvent(event.id, event.type);
    }

    try {
      await this.applyEvent(event);
      await this.webhooksRepository.markEventProcessed(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.webhooksRepository.markEventFailed(event.id, message);
      throw error;
    }
  }

  private async applyEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        if (event.data.object.payment_status === 'paid') {
          await this.markPaid(event.data.object);
        }
        break;

      case 'checkout.session.async_payment_succeeded':
        await this.markPaid(event.data.object);
        break;

          case 'checkout.session.async_payment_failed': {
        const invoiceId = await this.webhooksRepository.updatePendingPayment(
          event.data.object.id,
          PaymentStatus.Failed,
        );
        if (invoiceId) {
          await this.notify(invoiceId, 'failed');
        }
        break;
      }

      case 'checkout.session.expired':
        await this.webhooksRepository.updatePendingPayment(
          event.data.object.id,
          PaymentStatus.Expired,
        );
        break;
    }
  }

  private async markPaid(session: Stripe.Checkout.Session) {
    const payment = await this.webhooksRepository.findPaymentBySession(
      session.id,
    );
    if (!payment) {
      this.logger.warn(`No payment found for session ${session.id}`);
      return;
    }

    const invoice = await this.webhooksRepository.findInvoice(
      payment.invoiceId,
    );
    const matches =
      invoice &&
      session.metadata?.invoiceId === invoice.id &&
      session.amount_total === invoice.amount &&
      session.currency === invoice.currency;

    if (!matches) {
      this.logger.warn(`Session ${session.id} does not match its invoice`);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    const changed = await this.webhooksRepository.markPaid(
      payment.id,
      invoice.id,
      paymentIntentId,
    );
    if (changed) {
      await this.notify(invoice.id,'succeeded');
    }


    
  }
  private async notify(invoiceId: string, status: 'succeeded' | 'failed') {
    try {
      const ownerEmail = await this.webhooksRepository.findownerEmail(invoiceId);
      if (!ownerEmail) {
        this.logger.warn(`No owner email found for invoice ${invoiceId}`);
        return;
      }

      const invoice = await this.webhooksRepository.findInvoice(invoiceId);
      if (!invoice) {
        this.logger.warn(`No invoice found for invoice ${invoiceId}`);
        return;
      }

      if (status === 'succeeded') {
        await this.mailService.sendPaymentSucceeded(ownerEmail, invoice);
      } else {
        await this.mailService.sendPaymentFailed(ownerEmail, invoice);
      }
    } catch (error) {
      this.logger.error(`Could not send email for invoice ${invoiceId}`, error);
    }
  }
}
