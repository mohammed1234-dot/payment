import { z } from 'zod';

export const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z.string().min(8).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
