import { z } from 'zod';
import { currency } from '../../invoices/dto/create-invoice.dto.js';

export const importRowSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  amount: z.coerce.number().int().positive().max(99_999_999),
  currency,
  paid_at: z.coerce.date({ error: 'paid_at must be a date like 2026-10-01' }),
});

export type ImportRow = z.infer<typeof importRowSchema>;
