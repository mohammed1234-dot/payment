import { z } from 'zod';
import { InvoiceStatus } from '../../database/schema/invoice-status.js';

export const listInvoicesSchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(InvoiceStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;
