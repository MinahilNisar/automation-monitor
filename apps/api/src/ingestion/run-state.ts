import { ConflictException } from '@nestjs/common';
import type { IngestEvent } from './event.schema.js';
export type RunState = { status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'; startedAt: Date | null; finishedAt: Date | null };
export function nextRunState(current: RunState | null, event: IngestEvent): RunState {
  const at = new Date(event.occurredAt);
  if (event.type === 'STARTED') {
    if (current?.finishedAt && at > current.finishedAt) throw new ConflictException('Start time is after the recorded finish.');
    return { status: current?.status ?? 'RUNNING', startedAt: current?.startedAt && current.startedAt < at ? current.startedAt : at, finishedAt: current?.finishedAt ?? null };
  }
  const status = event.type === 'COMPLETED' ? 'SUCCEEDED' : 'FAILED';
  if (current?.startedAt && at < current.startedAt) throw new ConflictException('Finish time is before the recorded start.');
  if (current && current.status !== 'RUNNING' && (current.status !== status || current.finishedAt?.getTime() !== at.getTime())) {
    throw new ConflictException('This run already has a different terminal outcome or finish time.');
  }
  return { status, startedAt: current?.startedAt ?? null, finishedAt: at };
}
