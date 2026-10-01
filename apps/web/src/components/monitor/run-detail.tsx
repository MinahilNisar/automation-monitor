'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RerunPanel } from './rerun-panel';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { duration, statusLabel, timestamp, type Detail } from './types';
export function RunDetail({ userId, workspaceId, runId, onClose }: { userId: string; workspaceId: string; runId: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const query = useQuery({ queryKey: ['monitor-detail', userId, workspaceId, runId, page], queryFn: () => api<Detail>('/workspaces/' + workspaceId + '/monitor/runs/' + runId + '?page=' + page), refetchInterval: 30000 });
  return <section className="monitor-panel monitor-detail" aria-labelledby="run-detail-title">
    <div className="monitor-section-heading"><div><p className="eyebrow">EXECUTION DETAIL</p><h2 ref={heading} tabIndex={-1} id="run-detail-title">Event timeline</h2></div><Button variant="ghost" onClick={onClose} aria-label="Close run details"><X size={18} /></Button></div>
    {query.isPending ? <p role="status">Loading events…</p> : query.isError ? <div role="alert"><p>Unable to load this run. It may no longer be available to your account.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry details</Button></div> : <>
      <RerunPanel userId={userId} workspaceId={workspaceId} runId={runId} />
      <h3>{query.data.run.workflow.name}</h3><p className="monitor-external-id">{query.data.run.externalId}</p>
      <dl className="monitor-run-facts"><div><dt>Status</dt><dd><span className={'monitor-badge ' + query.data.run.status}>{statusLabel[query.data.run.status]}</span></dd></div><div><dt>Duration</dt><dd>{duration(query.data.run)}</dd></div><div><dt>Received</dt><dd>{timestamp(query.data.run.createdAt)}</dd></div><div><dt>Started</dt><dd>{timestamp(query.data.run.startedAt)}</dd></div><div><dt>Finished</dt><dd>{timestamp(query.data.run.finishedAt)}</dd></div></dl>
      <p className="muted">{query.data.totalEvents} events · ordered by reported time (UTC)</p>
      {!query.data.events.length ? <p>No events on this page.</p> : <ol className="monitor-timeline">{query.data.events.map(event => <li key={event.id}><strong>{event.type}</strong><time dateTime={event.occurredAt}>{timestamp(event.occurredAt)}</time><p>{event.message || 'No message provided.'}</p><small>Event ID: {event.externalId}</small></li>)}</ol>}
      <div className="monitor-pagination"><Button variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(p => p - 1)}>Earlier events</Button><span>Page {page} of {Math.max(1, query.data.totalPages)}</span><Button variant="outline" disabled={page >= query.data.totalPages || query.isFetching} onClick={() => setPage(p => p + 1)}>Later events</Button></div>
    </>}
  </section>;
}
