import { z } from 'zod';
export const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
export const monitorSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  workflowId: z.uuid().optional(),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED']).optional(),
  page: pageSchema,
}).strict().refine(value => {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
  return days >= 0 && days < 90;
}, 'Choose an ordered date range of at most 90 days.');
export type MonitorFilter = z.infer<typeof monitorSchema>;
export const eventPageSchema = z.object({ page: pageSchema }).strict();
export const workflowCursorSchema = z.object({ cursor: z.uuid().optional() }).strict();
