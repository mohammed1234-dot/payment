import { z } from 'zod';

export const createInvoiceSchema = z.strictObject({
  description: z.string().trim().min(1).max(1000),
  amount: z.number().int().positive().max(99_999_999),
  currency: z.enum(['usd', 'eur']),
  expiresAt: z.coerce
    .date()
    .refine((date) => date > new Date(), 'expiresAt must be in the future')
    .optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
