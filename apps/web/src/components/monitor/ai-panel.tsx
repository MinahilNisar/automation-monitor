'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
type Report = { observations: { eventId: string; quote: string }[]; hypotheses: { explanation: string; eventIds: string[] }[]; checks: string[]; missingEvidence: string[] };
type Preview = { hash: string; status: string; configured: boolean; canGenerate: boolean; input: { omittedEvents: number; events: { id: string; type: string; occurredAt: string; message: string; truncated: boolean }[] }; report: null | { id: string; status: string; model: string; createdAt: string; result: Report | null } };
export function AiPanel({ userId, workspaceId, runId }: { userId: string; workspaceId: string; runId: string }) {
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);
  const client = useQueryClient();
  const key = ['ai-review', userId, workspaceId, runId];
  const path = '/workspaces/' + workspaceId + '/runs/' + runId + '/ai';
  const query = useQuery({ queryKey: key, queryFn: () => api<Preview>(path), refetchInterval: 10000 });
  const mutation = useMutation({ mutationFn: (hash: string) => api<Preview>(path, 'POST', { evidenceHash: hash, confirmExternalProcessing: true }, 40000), onSuccess: data => { client.setQueryData(key, data); setReviewedHash(null); }, onSettled: () => { void client.invalidateQueries({ queryKey: key }); } });
  const data = query.data;
  const result = data?.report?.result;
  return <section className="monitor-panel" aria-label="AI failure review">
    <h3>AI failure review</h3>
    <p className="muted">AI suggestions can be wrong. Check the evidence before acting. Nothing here runs or repairs your automation.</p>
    {query.isPending ? <p role="status">Loading AI review…</p> : query.isError ? <p role="alert">Could not load AI review. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p> : data && <>
      {data.report ? <div aria-live="polite">
        <p><strong>{data.report.status === 'COMPLETE' ? 'Review ready' : data.report.status === 'PENDING' ? 'Generating review…' : 'No usable review was returned. This request will not be automatically resent.'}</strong></p>
        <p className="muted">{data.report.model} · {new Date(data.report.createdAt).toLocaleString()}</p>
        {result && <>
          <h4>Observed in the logs</h4>{result.observations.length ? <ul>{result.observations.map((item, i) => <li key={i}><strong>{item.eventId}</strong>: <q>{item.quote}</q></li>)}</ul> : <p>No diagnostic text was available to quote.</p>}
          <h4>Possible explanations — unverified</h4>{result.hypotheses.length ? <ul>{result.hypotheses.map((item, i) => <li key={i}>{item.explanation} <small>({item.eventIds.join(', ')})</small></li>)}</ul> : <p>There is not enough evidence to suggest a cause.</p>}
          <h4>Suggested manual checks</h4><ul>{result.checks.map((item, i) => <li key={i}>{item}</li>)}</ul>
          <h4>Missing evidence</h4><ul>{result.missingEvidence.map((item, i) => <li key={i}>{item}</li>)}</ul>
        </>}
      </div> : data.status !== 'FAILED' ? <p>Available for failed runs.</p> : !data.canGenerate ? <p>A workspace owner can request an AI review.</p> : !data.configured ? <p>AI is not configured. Add the server API key and model to enable reviews.</p> : reviewedHash === data.hash ? <div>
        <p>The evidence below will be sent to OpenAI. Automatic redaction may miss sensitive information. Cancel if anything should not leave your workspace. API usage may incur charges.</p>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate(data.hash)}>{mutation.isPending ? 'Generating…' : 'Send reviewed evidence to OpenAI'}</Button>{' '}
        <Button variant="outline" disabled={mutation.isPending} onClick={() => setReviewedHash(null)}>Cancel</Button>
      </div> : <Button onClick={() => setReviewedHash(data.hash)}>Review evidence for AI</Button>}
      {mutation.isError && <p role="alert">Request unavailable or evidence changed. Refresh and review again. A recorded request is never automatically resent.</p>}
      <details open={reviewedHash === data.hash}><summary>Redacted evidence · {data.input.events.length} events</summary>
        <p>{data.input.omittedEvents} older events omitted. Names, execution IDs and replay input are excluded.</p>
        <ol>{data.input.events.map(e => <li key={e.id}><strong>{e.id} · {e.type}</strong><p>{e.message || '(No message)'}</p>{e.truncated && <small>Message truncated.</small>}</li>)}</ol>
      </details>
    </>}
  </section>;
}
