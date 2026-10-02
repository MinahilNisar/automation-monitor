import { createHash } from 'node:crypto';
import { z } from 'zod';
export const POLICY = 'failure-review-v1';
export function redact(text: string): string {
  return text.replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, '[REDACTED KEY]')
    .replace(/(?:authorization|cookie|password|passwd|secret|token|api[_ -]?key)\s*["']?\s*[:=]\s*[^\r\n]+/gi, '[REDACTED CREDENTIAL]')
    .replace(/\bBearer\s+\S+/gi, '[REDACTED CREDENTIAL]')
    .replace(/\b(?:https?|postgres(?:ql)?|redis):\/\/[^\s"'<>]+/gi, '[REDACTED URL]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED IP]')
    .replace(/\b[A-Za-z0-9_+/.=-]{24,}\b/g, '[REDACTED TOKEN]')
    .replace(/(?:\+?\d[ ()-]*){10,}/g, '[REDACTED NUMBER]')
    // Strip non-printing log controls before previewing or forwarding evidence.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}
export type SourceEvent = { type: string; occurredAt: Date; message: string };
export function evidence(events: SourceEvent[], total: number) {
  const items = events.map((e, i) => ({ id: 'E' + (i + 1), type: e.type, occurredAt: e.occurredAt.toISOString(), message: redact(e.message).slice(0, 700), truncated: redact(e.message).length > 700 }));
  const input = { policy: POLICY, status: 'FAILED', omittedEvents: Math.max(0, total - events.length), events: items };
  return { input, hash: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
}
export type Evidence = ReturnType<typeof evidence>['input'];
export const reportSchema = z.object({
  observations: z.array(z.object({ eventId: z.string(), quote: z.string().min(1).max(700) }).strict()).max(8),
  hypotheses: z.array(z.object({ explanation: z.string().min(1).max(600), eventIds: z.array(z.string()).min(1).max(8) }).strict()).max(3),
  checks: z.array(z.string().min(1).max(400)).min(1).max(5),
  missingEvidence: z.array(z.string().min(1).max(400)).min(1).max(5),
}).strict();
export function validateReport(value: unknown, input: Evidence) {
  const result = reportSchema.parse(value);
  const events = new Map(input.events.map(e => [e.id, e]));
  for (const item of result.observations) if (!events.get(item.eventId)?.message.includes(item.quote)) throw new Error('Unsupported quotation');
  for (const item of result.hypotheses) {
    if (item.eventIds.some(id => !events.get(id)?.message.trim())) throw new Error('Unsupported evidence reference');
    item.explanation = redact(item.explanation);
  }
  if (!input.events.some(e => e.message.trim()) && (result.observations.length || result.hypotheses.length)) throw new Error('No diagnostic evidence');
  result.checks = result.checks.map(redact);
  result.missingEvidence = result.missingEvidence.map(redact);
  return result;
}
