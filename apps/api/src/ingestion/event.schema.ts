import { replayInputSchema } from '../live/reruns.schema.js';
import { z } from 'zod';
const identifier = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const eventSchema = z.object({
  runId: identifier,
  eventId: identifier,
  type: z.enum(['STARTED', 'COMPLETED', 'FAILED']),
  occurredAt: z.string().datetime({ offset: true }).refine(value => {
    const fraction = value.split('.')[1]?.split(/Z|[+-]/)[0];
    return (!fraction || fraction.length <= 3) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() + 300000;
  }, 'Use an ISO timestamp with at most millisecond precision, no more than five minutes in the future.'),
  replayInput: replayInputSchema.optional(),
  rerunRequestId: z.string().uuid().optional(),
  message: z.string().max(2000).default(''),
}).strict().refine(event => (!event.replayInput && !event.rerunRequestId) || event.type === 'STARTED', 'Replay metadata is only accepted on STARTED events.').refine(event => !event.rerunRequestId || !!event.replayInput, 'Rerun correlation requires replay input.');
export type IngestEvent = z.infer<typeof eventSchema>;
