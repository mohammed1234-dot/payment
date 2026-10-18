import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, inArray, like } from 'drizzle-orm';
import Stripe from 'stripe';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import {
  invoices,
  payments,
  users,
  type Invoice,
} from '../src/database/schema/index.js';
import { InvoiceStatus } from '../src/database/schema/invoice-status.js';
import { createTestApp } from './create-test-app.js';

const EMAIL_DOMAIN = '@payment-link-e2e.test';
const PASSWORD = 'correct horse battery';

const stripeMock = {
  createCheckoutSession: vi.fn(async (invoice: Invoice) => {
    const id = `cs_test_${invoice.id}_${invoice.stripeCheckoutSessionId ?? 'first'}`;
    return {
      id,
      url: `https://checkout.stripe.com/c/pay/${id}`,
      status: 'open',
    };
  }),
  getCheckoutSession: vi.fn(),
};

describe('Payment link (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService['db'];
  let ownerToken: string;
  let otherToken: string;

  async function createUserAndLogin(): Promise<string> {
    const email = `user-${randomUUID()}${EMAIL_DOMAIN}`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Test', email, password: PASSWORD })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.accessToken;
  }

  async function createInvoice(body: object = {}) {
    const response = await request(app.getHttpServer())
      .post('/v1/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'Logo', amount: 5000, currency: 'usd', ...body })
      .expect(201);
    return response.body as { id: string; publicToken: string };
  }

  function paymentLink(id: string, token = ownerToken) {
    return request(app.getHttpServer())
      .post(`/v1/invoices/${id}/payment-link`)
      .set('Authorization', `Bearer ${token}`);
  }

  function paymentsFor(invoiceId: string) {
    return db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  }

  beforeAll(async () => {
    app = await createTestApp(stripeMock);
    db = app.get(DatabaseService).db;
    ownerToken = await createUserAndLogin();
    otherToken = await createUserAndLogin();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(async () => {
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${EMAIL_DOMAIN}`));
    const userIds = testUsers.map((user) => user.id);
    if (userIds.length > 0) {
      const testInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.userId, userIds));
      const invoiceIds = testInvoices.map((invoice) => invoice.id);
      if (invoiceIds.length > 0) {
        await db
          .delete(payments)
          .where(inArray(payments.invoiceId, invoiceIds));
        await db.delete(invoices).where(inArray(invoices.id, invoiceIds));
      }
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
  });

  it('creates a Checkout Session with the amount from the database', async () => {
    const invoice = await createInvoice();

    const response = await paymentLink(invoice.id).expect(200);

    expect(response.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const [sentInvoice] = stripeMock.createCheckoutSession.mock.calls[0];
    expect(sentInvoice).toMatchObject({
      id: invoice.id,
      amount: 5000,
      currency: 'usd',
    });

    const rows = await paymentsFor(invoice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stripeCheckoutSessionId: `cs_test_${invoice.id}_first`,
      amount: 5000,
      currency: 'usd',
      status: 'pending',
    });
    const [saved] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    expect(saved.stripeCheckoutSessionId).toBe(`cs_test_${invoice.id}_first`);
  });

  it('reuses the session while it is still open', async () => {
    const invoice = await createInvoice();
    await paymentLink(invoice.id).expect(200);
    stripeMock.getCheckoutSession.mockResolvedValue({
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/same',
    });
    stripeMock.createCheckoutSession.mockClear();

    const response = await paymentLink(invoice.id).expect(200);

    expect(response.body.url).toBe('https://checkout.stripe.com/c/pay/same');
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled();
    expect(await paymentsFor(invoice.id)).toHaveLength(1);
  });

  it('creates a new attempt when the old session expired', async () => {
    const invoice = await createInvoice();
    await paymentLink(invoice.id).expect(200);
    stripeMock.getCheckoutSession.mockResolvedValue({
      status: 'expired',
      url: null,
    });

    await paymentLink(invoice.id).expect(200);

    const [secondCall] = stripeMock.createCheckoutSession.mock.calls[1];
    expect(secondCall.stripeCheckoutSessionId).toBe(
      `cs_test_${invoice.id}_first`,
    );
    expect(await paymentsFor(invoice.id)).toHaveLength(2);
  });

  it('two requests at the same time make one payment row', async () => {
    const invoice = await createInvoice();
    stripeMock.getCheckoutSession.mockResolvedValue({
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/same',
    });

    const [first, second] = await Promise.all([
      paymentLink(invoice.id),
      paymentLink(invoice.id),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await paymentsFor(invoice.id)).toHaveLength(1);
  });

  it("answers 404 for another user's invoice", async () => {
    const invoice = await createInvoice();

    await paymentLink(invoice.id, otherToken).expect(404);
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('answers 409 for a paid invoice', async () => {
    const invoice = await createInvoice();
    await db
      .update(invoices)
      .set({ status: InvoiceStatus.Paid })
      .where(eq(invoices.id, invoice.id));

    const response = await paymentLink(invoice.id).expect(409);

    expect(response.body.message).toBe('Invoice is paid');
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('answers 409 and marks the invoice expired after expiresAt', async () => {
    const invoice = await createInvoice({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await db
      .update(invoices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invoices.id, invoice.id));

    await paymentLink(invoice.id).expect(409);

    const [saved] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoice.id));
    expect(saved.status).toBe('expired');
    expect(stripeMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('answers 502 and saves nothing when Stripe fails', async () => {
    const invoice = await createInvoice();
    stripeMock.createCheckoutSession.mockRejectedValueOnce(
      new Stripe.errors.StripeConnectionError({ message: 'timeout' }),
    );

    const response = await paymentLink(invoice.id).expect(502);

    expect(response.body.message).toBe('Payment provider error');
    expect(await paymentsFor(invoice.id)).toHaveLength(0);
  });

  it('lets the customer start checkout from the public link', async () => {
    const invoice = await createInvoice();

    const response = await request(app.getHttpServer())
      .post(`/v1/public/invoices/${invoice.publicToken}/checkout`)
      .expect(200);

    expect(response.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    await request(app.getHttpServer())
      .post(`/v1/public/invoices/${invoice.publicToken}x/checkout`)
      .expect(404);
  });
});
