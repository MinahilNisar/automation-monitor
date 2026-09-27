import { eventSchema } from './event.schema.js';
import { nextRunState } from './run-state.js';
const start = { runId: 'run-1', eventId: 'start', type: 'STARTED' as const, occurredAt: '2026-01-01T10:00:00.000Z', message: '' };
const end = { ...start, eventId: 'end', type: 'COMPLETED' as const, occurredAt: '2026-01-01T10:00:10.000Z' };
describe('Run transitions', () => {
  it('supports a completion before start without inventing a start time', () => {
    const finished = nextRunState(null, end);
    expect(finished).toMatchObject({ status: 'SUCCEEDED', startedAt: null });
    expect(nextRunState(finished, start)).toMatchObject({ status: 'SUCCEEDED', startedAt: new Date(start.occurredAt), finishedAt: new Date(end.occurredAt) });
  });
  it('rejects a conflicting final status and finish time', () => {
    const finished = nextRunState(null, end);
    expect(() => nextRunState(finished, { ...end, type: 'FAILED' })).toThrow();
    expect(() => nextRunState(finished, { ...end, occurredAt: '2026-01-01T10:00:11.000Z' })).toThrow();
  });
  it('rejects impossible chronology', () => {
    expect(() => nextRunState(nextRunState(null, end), { ...start, occurredAt: '2026-01-01T10:01:00.000Z' })).toThrow();
    expect(() => nextRunState(nextRunState(null, start), { ...end, occurredAt: '2026-01-01T09:59:00.000Z' })).toThrow();
  });
  it('retains earliest start while allowing a later started notification', () => {
    expect(nextRunState(nextRunState(null, start), { ...start, occurredAt: '2026-01-01T10:00:01.000Z' }).startedAt).toEqual(new Date(start.occurredAt));
  });
  it('rejects invalid inputs and unknown fields', () => {
    for (const invalid of [{ ...start, extra: true }, { ...start, message: 'x'.repeat(2001) }, { ...start, occurredAt: 'not-a-date' }, { ...start, occurredAt: '2026-01-01T10:00:00.1234Z' }, { ...start, occurredAt: new Date(Date.now() + 86400000).toISOString() }]) expect(eventSchema.safeParse(invalid).success).toBe(false);
  });
});
