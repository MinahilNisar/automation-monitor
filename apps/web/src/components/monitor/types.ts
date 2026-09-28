export type RunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type Run = { id: string; externalId: string; status: RunStatus; createdAt: string; startedAt: string | null; finishedAt: string | null; workflow: { id: string; name: string; slug: string } };
export type Daily = { day: string; RUNNING: number; SUCCEEDED: number; FAILED: number };
export type Overview = { summary: { total: number; running: number; succeeded: number; failed: number; successRate: number | null }; daily: Daily[]; items: Run[]; page: number; pageSize: number; totalPages: number };
export type Detail = { run: Run; events: { id: string; externalId: string; type: string; occurredAt: string; message: string }[]; totalEvents: number; page: number; totalPages: number };
export function duration(run: Run) {
  if (!run.startedAt) return 'Unknown start';
  if (!run.finishedAt) return 'In progress';
  const seconds = (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000;
  if (seconds < 60) return seconds.toFixed(1) + 's';
  if (seconds < 3600) return (seconds / 60).toFixed(1) + 'm';
  return (seconds / 3600).toFixed(1) + 'h';
}
export function timestamp(value: string | null) { return value ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC').replace('Z', ' UTC') : 'Not reported'; }
export const statusLabel = { RUNNING: 'Running', SUCCEEDED: 'Succeeded', FAILED: 'Failed' };
