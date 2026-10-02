import { evidence, redact, validateReport } from './evidence.js';
const input = evidence([{ type: 'FAILED', occurredAt: new Date('2026-01-01'), message: 'Order amount must be positive.' }], 1).input;
const good = () => ({ observations: [{ eventId: 'E1', quote: 'amount must be positive' }], hypotheses: [{ explanation: 'The input may contain a nonpositive amount.', eventIds: ['E1'] }], checks: ['Inspect the validated amount.'], missingEvidence: ['The original input is not included.'] });
describe('AI evidence evaluation cases', () => {
  it.each(['password=super-secret', 'Authorization: Bearer fake-private', 'https://example.test/?key=secret', 'person@example.test', '10.20.30.40', 'amk_' + 'x'.repeat(43)])('redacts sensitive pattern %s', value => { expect(redact(value)).toContain('[REDACTED'); expect(redact(value)).not.toContain(value); });
  it('accepts exact cited evidence', () => { expect(validateReport(good(), input).observations).toHaveLength(1); });
  it('rejects fabricated quotation', () => { const value = good(); value.observations[0].quote = 'Database is down'; expect(() => validateReport(value, input)).toThrow(); });
  it('rejects invented event IDs', () => { const value = good(); value.hypotheses[0].eventIds = ['E900']; expect(() => validateReport(value, input)).toThrow(); });
  it('requires missing evidence', () => { expect(() => validateReport({ ...good(), missingEvidence: [] }, input)).toThrow(); });
  it('does not permit causes from empty logs', () => { const empty = evidence([{ type: 'FAILED', occurredAt: new Date(), message: '' }], 1).input; expect(() => validateReport(good(), empty)).toThrow(); expect(validateReport({ observations: [], hypotheses: [], checks: ['Collect the failing node logs.'], missingEvidence: ['No error message was recorded.'] }, empty).hypotheses).toEqual([]); });
  it('bounds and fingerprints evidence', () => { const a = evidence([{ type: 'FAILED', occurredAt: new Date('2026-01-01'), message: 'a '.repeat(1000) }], 20); expect(a.input.events[0].message.length).toBe(700); expect(a.input.events[0].truncated).toBe(true); expect(a.input.omittedEvents).toBe(19); expect(a.hash).not.toBe(evidence([], 0).hash); });
});
