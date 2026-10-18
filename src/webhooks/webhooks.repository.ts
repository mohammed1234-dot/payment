import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { invoices, payments, webhookEvents } from '../database/schema/index.js';
import { InvoiceStatus } from '../database/schema/invoice-status.js';
import { PaymentStatus } from '../database/schema/payment-status.js';
import { WebhookEventStatus } from '../database/schema/webhook-events-status.js';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly database: DatabaseService) {}

  async findEvent(stripeEventId: string) {
    const [event] = await this.database.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, stripeEventId))
      .limit(1);
    return event;
  }

  async saveEvent(stripeEventId: string, eventType: string) {
    await this.database.db
      .insert(webhookEvents)
      .values({
        stripeEventId,
        eventType,
        status: WebhookEventStatus.Processing,
      })
      .onConflictDoNothing();
  }

  async markEventProcessed(stripeEventId: string) {
    await this.database.db
      .update(webhookEvents)
      .set({
        status: WebhookEventStatus.Processed,
        processedAt: new Date(),
        lastError: null,
      })
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
  }

  async markEventFailed(stripeEventId: string, error: string) {
    await this.database.db
      .update(webhookEvents)
      .set({ status: WebhookEventStatus.Failed, lastError: error })
      .where(eq(webhookEvents.stripeEventId, stripeEventId));
  }

  async findPaymentBySession(sessionId: string) {
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(eq(payments.stripeCheckoutSessionId, sessionId))
      .limit(1);
    return payment;
  }

  async findInvoice(id: string) {
    const [invoice] = await this.database.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    return invoice;
  }

  async markPaid(
    paymentId: string,
    invoiceId: string,
    paymentIntentId: string | null,
  ) {
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: PaymentStatus.Succeeded,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        })
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.status, PaymentStatus.Pending),
          ),
        );

      await tx
        .update(invoices)
        .set({ status: InvoiceStatus.Paid, paidAt: new Date() })
        .where(
          and(
            eq(invoices.id, invoiceId),
            inArray(invoices.status, [
              InvoiceStatus.Pending,
              InvoiceStatus.Expired,
            ]),
          ),
        );
    });
  }

  async updatePendingPayment(sessionId: string, status: PaymentStatus) {
    await this.database.db
      .update(payments)
      .set({ status })
      .where(
        and(
          eq(payments.stripeCheckoutSessionId, sessionId),
          eq(payments.status, PaymentStatus.Pending),
        ),
      );
  }
}
