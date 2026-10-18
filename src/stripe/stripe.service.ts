import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import type { Invoice } from '../database/schema/index.js';

@Injectable()
export class StripeService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    timeout: 10_000,
    maxNetworkRetries: 2,
  });

  createCheckoutSession(invoice: Invoice) {
    const previousSession = invoice.stripeCheckoutSessionId ?? 'first';

    return this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: invoice.currency,
              unit_amount: invoice.amount,
              product_data: {
                name: `Invoice ${invoice.invoiceNumber}`,
                description: invoice.description,
              },
            },
          },
        ],
        success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/payment/cancel`,
        client_reference_id: invoice.id,
        metadata: { invoiceId: invoice.id },
        payment_intent_data: { metadata: { invoiceId: invoice.id } },
      },
      { idempotencyKey: `checkout-${invoice.id}-${previousSession}` },
    );
  }

  getCheckoutSession(sessionId: string) {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }
}
