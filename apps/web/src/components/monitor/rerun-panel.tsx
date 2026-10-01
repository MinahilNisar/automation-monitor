'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { timestamp } from './types';
type Rerun = { eligible: boolean; reason: string | null; input: { orderId: string; amount: number } | null; audit: null | { id: string; requestedByName: string; createdAt: string; status: string; result: null | { id: string; status: string; externalId: string } } };
export function RerunPanel({ userId, workspaceId, runId }: { userId: string; workspaceId: string; runId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const key = ['rerun', userId, workspaceId, runId];
  const path = '/workspaces/' + workspaceId + '/runs/' + runId + '/rerun';
  const query = useQuery({ queryKey: key, queryFn: () => api<Rerun>(path), refetchInterval: 15000 });
  const request = useMutation({ mutationFn: () => api<Rerun>(path, 'POST', { requestId }), onSuccess: data => { client.setQueryData(key, data); setConfirming(false); }, onSettled: () => { void client.invalidateQueries({ queryKey: key }); } });
  return <section className="monitor-panel" aria-label="Rerun controls"><h3>Controlled rerun</h3>{query.isPending ? <p role="status">Checking rerun support…</p> : query.isError ? <p role="alert">Rerun details unavailable. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p> : <>
    <p className="muted">Only the connected order-validation example is supported. A rerun uses the same saved input and creates a new execution. Invalid input will fail again.</p>
    {query.data.audit ? <div aria-live="polite"><p><strong>{query.data.audit.status === 'OBSERVED' ? 'New execution observed' : query.data.audit.status === 'REJECTED' ? 'Webhook rejected the request' : query.data.audit.status === 'REQUESTED' ? 'Request recorded · awaiting execution' : 'Outcome uncertain · check n8n execution history'}</strong></p><p>Requested by {query.data.audit.requestedByName} · {timestamp(query.data.audit.createdAt)}</p>{query.data.audit.result && <p>New run: <code>{query.data.audit.result.externalId}</code> · {query.data.audit.result.status}</p>}<small>Audit ID: {query.data.audit.id}</small><p className="muted">One request is allowed per source run. Requests are never automatically resent.</p></div> : !query.data.eligible ? <p>{query.data.reason}</p> : confirming ? <div><p>Start a new execution using order <strong>{query.data.input?.orderId}</strong> and amount <strong>{query.data.input?.amount}</strong>?</p><p>This repeats the sample workflow. The original run stays unchanged.</p><Button disabled={request.isPending} onClick={() => request.mutate()}>{request.isPending ? 'Requesting…' : 'Confirm rerun'}</Button> <Button variant="outline" disabled={request.isPending} onClick={() => setConfirming(false)}>Cancel</Button></div> : <Button onClick={() => setConfirming(true)}>Review rerun</Button>}
    {request.isError && <p className="help" role="alert">The request response was unavailable. Refresh the audit before trying again; the server may have recorded it.</p>}
  </>}</section>;
}
