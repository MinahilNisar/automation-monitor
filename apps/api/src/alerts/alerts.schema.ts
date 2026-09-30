import { z } from 'zod';
export const policySchema = z.object({
  failureEnabled: z.boolean(),
  expectedMinutes: z.number().int().min(1).max(10080).nullable(),
}).strict();
export const alertPageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type PolicyInput = z.infer<typeof policySchema>;
