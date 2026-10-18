import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, like } from 'drizzle-orm';
import Stripe from 'stripe';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { InvoiceStatus } from '../src/database/schema/invoice-status.js';
import {
  invoices,
  payments,
  users,
  webhookEvents,
} from '../src/database/schema/index.js';
import { createTestApp } from './create-test-app.js';

const WEBHOOK_SECRET = 'whsec_e2e_test_secret';
const EMAIL_DOMAIN = '@webhooks-e2e.test';
const stripe = new Stripe('sk_test_not_used');

type TestPayment = {
  invoiceId: string;
  sessionId: string;
  amount: number;
  currency: string;
};

describe('Stripe webhook (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService['db'];
  let userId: string;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    app = await createTestApp();
    db = app.get(DatabaseService).db;
    const [user] = await db
      .insert(users)
      .values({ email: `owner${EMAIL_DOMAIN}`, passwordHash: 'x' })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    const testInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.userId, userId));
    const invoiceIds = testInvoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      await db.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
      await db.delete(invoices).where(inArray(invoices.id, invoiceIds));
    }
    await db.delete(users).where(like(users.email, `%${EMAIL_DOMAIN}`));
    await db
      .delete(webhookEvents)
      .where(like(webhookEvents.stripeEventId, 'evt_e2e_%'));
    await app.close();
  });

  async function createPendingPayment(): Promise<TestPayment> {
    const [invoice] = await db
      .insert(invoices)
      .values({
        userId,
        invoiceNumber: `INV-E2E-${randomBytes(4).toString('hex')}`,
        description: 'Webhook test',
        amount: 4200,
        currency: 'usd',
        publicTokenHash: randomBytes(16).toString('hex'),
      })
      .returning();
    const sessionId = `cs_test_e2e_${randomUUID()}`;
    await db.insert(payments).values({
      invoiceId: invoice.id,
      stripeCheckoutSessionId: sessionId,
      amount: 4200,
      currency: 'usd',
    });
    return { invoiceId: invoice.id, sessionId, amount: 4200, currency: 'usd' };
  }

  function sessionEvent(
    type: string,
    payment: TestPayment,
    session: Record<string, unknown> = {},
    eventId = `evt_e2e_${randomUUID()}`,
  ) {
    return {
      id: eventId,
      object: 'event',
      type,
      data: {
        object: {
          id: payment.sessionId,
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: payment.amount,
          currency: payment.currency,
          metadata: { invoiceId: payment.invoiceId },
          payment_intent: `pi_${payment.sessionId}`,
          ...session,
        },
      },
    };
  }

  function send(event: object, secret = WEBHOOK_SECRET) {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    return request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
  }

  async function state(payment: TestPayment) {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId));
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeCheckoutSessionId, payment.sessionId));
    return { invoice, payment: row };
  }

  it('answers 400 for a wrong signature or no signature', async () => {
    const payment = await createPendingPayment();
    const event = sessionEvent('checkout.session.completed', payment);

    await send(event, 'whsec_wrong_secret').expect(400);
    await request(app.getHttpServer())
      .post('/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(event))
      .expect(400);

    expect((await state(payment)).invoice.status).toBe('pending');
  });

  it('marks the invoice and payment paid on checkout.session.completed', async () => {
    const payment = await createPendingPayment();
    const event = sessionEvent('checkout.session.completed', payment);

    await send(event).expect(200).expect({ received: true });

    const { invoice, payment: row } = await state(payment);
    expect(invoice.status).toBe('paid');
    expect(invoice.paidAt).not.toBeNull();
    expect(row.status).toBe('succeeded');
    expect(row.stripePaymentIntentId).toBe(`pi_${payment.sessionId}`);
    const [saved] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, event.id));
    expect(saved.status).toBe('processed');
  });

  it('applies the same event only once', async () => {
    const payment = await createPendingPayment();
    const event = sessionEvent('checkout.session.completed', payment);

    await send(event).expect(200);
    const first = await state(payment);
    await send(event).expect(200);
    const second = await state(payment);

    expect(second.invoice.paidAt).toEqual(first.invoice.paidAt);
    const rows = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, event.id));
    expect(rows).toHaveLength(1);
  });

  it('waits for async_payment_succeeded when completed is still unpaid', async () => {
    const payment = await createPendingPayment();

    await send(
      sessionEvent('checkout.session.completed', payment, {
        payment_status: 'unpaid',
      }),
    ).expect(200);
    expect((await state(payment)).invoice.status).toBe('pending');

    await send(
      sessionEvent('checkout.session.async_payment_succeeded', payment),
    ).expect(200);
    expect((await state(payment)).invoice.status).toBe('paid');
  });

  it('keeps the invoice pending when the async payment fails', async () => {
    const payment = await createPendingPayment();

    await send(
      sessionEvent('checkout.session.async_payment_failed', payment, {
        payment_status: 'unpaid',
      }),
    ).expect(200);

    const { invoice, payment: row } = await state(payment);
    expect(row.status).toBe('failed');
    expect(invoice.status).toBe('pending');
  });

  it('a late expired event does not undo a payment', async () => {
    const payment = await createPendingPayment();

    await send(sessionEvent('checkout.session.completed', payment)).expect(200);
    await send(
      sessionEvent('checkout.session.expired', payment, {
        payment_status: 'unpaid',
      }),
    ).expect(200);

    const { invoice, payment: row } = await state(payment);
    expect(row.status).toBe('succeeded');
    expect(invoice.status).toBe('paid');
  });

  it('marks the attempt expired when the session expires unpaid', async () => {
    const payment = await createPendingPayment();

    await send(
      sessionEvent('checkout.session.expired', payment, {
        payment_status: 'unpaid',
      }),
    ).expect(200);

    const { invoice, payment: row } = await state(payment);
    expect(row.status).toBe('expired');
    expect(invoice.status).toBe('pending');
  });

  it('does not mark paid when the amount or currency does not match', async () => {
    const payment = await createPendingPayment();

    await send(
      sessionEvent('checkout.session.completed', payment, { amount_total: 1 }),
    ).expect(200);
    await send(
      sessionEvent('checkout.session.completed', payment, { currency: 'eur' }),
    ).expect(200);

    const { invoice, payment: row } = await state(payment);
    expect(invoice.status).toBe('pending');
    expect(row.status).toBe('pending');
  });

  it('marks an invoice paid even if it expired while the customer was paying', async () => {
    const payment = await createPendingPayment();
    await db
      .update(invoices)
      .set({ status: InvoiceStatus.Expired })
      .where(eq(invoices.id, payment.invoiceId));

    await send(sessionEvent('checkout.session.completed', payment)).expect(200);

    expect((await state(payment)).invoice.status).toBe('paid');
  });

  it('answers 200 and changes nothing for an unknown session or event type', async () => {
    const payment = await createPendingPayment();

    await send(
      sessionEvent('checkout.session.completed', {
        ...payment,
        sessionId: 'cs_test_unknown',
      }),
    ).expect(200);
    await send(sessionEvent('customer.created', payment)).expect(200);

    expect((await state(payment)).invoice.status).toBe('pending');
  });
});
