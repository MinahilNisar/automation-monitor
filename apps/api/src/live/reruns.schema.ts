import { z } from 'zod';
export const replayInputSchema = z.object({ orderId: z.string().min(1).max(80), amount: z.number().min(-1000000).max(1000000) }).strict();
export const rerunSchema = z.object({ requestId: z.string().uuid() }).strict();
