import type { Invoice } from '../../database/schema/index.js';

export function toInvoiceResponse(invoice: Invoice) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    description: invoice.description,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
  };
}

export function toPublicInvoiceResponse(invoice: Invoice) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    description: invoice.description,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    expiresAt: invoice.expiresAt,
    paidAt: invoice.paidAt,
  };
}
