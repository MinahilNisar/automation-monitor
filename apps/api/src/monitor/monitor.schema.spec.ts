import { monitorSchema } from './monitor.schema.js';
describe('Dashboard filters', () => {
  it('accepts a single UTC day and defaults to the first page', () => { expect(monitorSchema.parse({ from: '2026-09-27', to: '2026-09-27' }).page).toBe(1); });
  it('rejects invalid, reversed or unbounded dates and unsafe pagination', () => {
    for (const patch of [{ from: '2026-02-30' }, { from: '2026-10-01' }, { from: '2025-01-01' }, { page: '0' }, { page: '1.2' }, { status: 'UNKNOWN' }, { extra: 'ignored?' }, { workflowId: 'invalid' }]) expect(monitorSchema.safeParse({ from: '2026-09-01', to: '2026-09-27', ...patch }).success).toBe(false);
  });
});
