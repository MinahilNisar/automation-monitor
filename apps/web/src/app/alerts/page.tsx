'use client';
import { useWorkspaceLive } from '@/lib/use-workspace-live';
import Link from 'next/link';
import { useState } from 'react';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RunDetail } from '@/components/monitor/run-detail';
import { timestamp } from '@/components/monitor/types';
import '../dashboard/dashboard.css';
import './alerts.css';
type Space = { workspaceId: string; role: string; workspace: { name: string } };
type Policy = { failureEnabled: boolean; expectedMinutes: number | null };
type Options = { items: { id: string; name: string }[]; nextCursor: string | null };
type Alert = { id: string; kind: 'FAILURE' | 'MISSING_RUN'; message: string; delivery: 'PENDING' | 'DELIVERED' | 'FAILED'; attempts: number; lastError: string | null; createdAt: string; readAt: string | null; runId: string | null; workflow: { id: string; name: string } };
type Inbox = { items: Alert[]; total: number; unread: number; totalPages: number };
export default function AlertsPage() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5000, gcTime: 60000, retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1 } } }));
  return <QueryClientProvider client={client}><AlertsHome /></QueryClientProvider>;
}
function AlertsHome() {
  const user = useQuery({ queryKey: ['alert-session'], queryFn: () => api<{ id: string }>('/auth/me'), refetchInterval: 30000 });
  return <main className="monitor-page shell"><header className="topbar"><Link className="brand" href="/"><span className="brand-icon">A</span>Automation Monitor</Link><nav aria-label="Main navigation"><Link href="/dashboard">Dashboard</Link><Link href="/alerts" aria-current="page">Alerts</Link><Link href="/account">Workspace settings</Link></nav></header>
    {user.isPending ? <p role="status">Checking your session…</p> : user.isError ? <section className="monitor-panel monitor-empty"><h1>Check your account</h1><p>Your session may have ended, or the server is unavailable.</p><Button asChild><Link href="/account">Sign in</Link></Button><Button onClick={() => void user.refetch()}>Retry</Button></section> : <div style={{ visibility: user.isFetching ? 'hidden' : undefined }} aria-hidden={user.isFetching}><WorkspaceAlerts key={user.data.id} userId={user.data.id} /></div>}
    <footer>Workspace inbox · Times shown in UTC · No email or chat messages are sent</footer></main>;
}
function WorkspaceAlerts({ userId }: { userId: string }) {
  const [selected, setSelected] = useState('');
  const spaces = useQuery({ queryKey: ['alert-spaces', userId], queryFn: () => api<Space[]>('/workspaces'), refetchInterval: 30000 });
  if (spaces.isPending) return <p role="status">Loading workspaces…</p>;
  if (spaces.isError) return <p role="alert">Workspaces unavailable. <Button onClick={() => void spaces.refetch()}>Retry</Button></p>;
  if (!spaces.data.length) return <p>Create a workspace in <Link href="/account">account settings</Link> to get started.</p>;
  const space = spaces.data.find(s => s.workspaceId === selected) ?? spaces.data[0];
  return <><div className="monitor-heading"><div><p className="eyebrow">STAY INFORMED</p><h1>Your alert inbox<span>.</span></h1><p>Failures and missing runs, with a shared record of what your team has read.</p></div><label className="monitor-workspace">Workspace<select value={space.workspaceId} onChange={e => setSelected(e.target.value)}>{spaces.data.map(s => <option key={s.workspaceId} value={s.workspaceId}>{s.workspace.name}</option>)}</select></label></div><InboxPanel key={userId + space.workspaceId} userId={userId} space={space} /></>;
}
function InboxPanel({ userId, space }: { userId: string; space: Space }) {
  const client = useQueryClient();
  const live = useWorkspaceLive(userId, space.workspaceId);
  const [page, setPage] = useState(1);
  const [workflowId, setWorkflowId] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const path = '/workspaces/' + space.workspaceId;
  const key = ['alerts', userId, space.workspaceId];
  const inbox = useQuery({ queryKey: [...key, page], queryFn: () => api<Inbox>(path + '/alerts?page=' + page), refetchInterval: 15000 });
  const workflows = useInfiniteQuery({ queryKey: ['alert-workflows', userId, space.workspaceId], initialPageParam: '', queryFn: ({ pageParam }) => api<Options>(path + '/monitor/workflows' + (pageParam ? '?cursor=' + pageParam : '')), getNextPageParam: last => last.nextCursor ?? undefined });
  const options = workflows.data?.pages.flatMap(p => p.items) ?? [];
  const read = useMutation({ mutationFn: (id: string) => api(path + '/alerts/' + id + '/read', 'PATCH'), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
  if (live.revoked) return <p role="alert">Workspace access ended. Reload after signing in again.</p>;
  return <><p role="status" className="muted">{live.status}</p><div className="alerts-layout"><section className="monitor-panel"><div className="monitor-section-heading"><div><p className="eyebrow">NOTIFICATIONS</p><h2><Bell size={20} aria-hidden="true" /> Activity to review</h2></div><Button variant="outline" disabled={inbox.isFetching} onClick={() => void inbox.refetch()}><RefreshCw size={14} /> Refresh</Button></div>
    <p className="muted">{!inbox.isError && inbox.data ? inbox.data.unread + ' unread · ' + inbox.data.total + ' total · ' : ''}Refreshes every 15 seconds</p>
    {read.isError && <p role="alert" className="help">Could not mark the alert as read. Please retry.</p>}
    {inbox.isPending ? <p role="status">Loading alerts…</p> : inbox.isError ? <p role="alert">Alerts could not be loaded. Check your session and retry.</p> : !inbox.data.items.length ? <div className="monitor-empty"><CheckCheck size={32} /><h3>No alerts on this page</h3><p>Enable a workflow rule to watch for future failures or missing runs.</p></div> : <ul className="alerts-list">{inbox.data.items.map(alert => <li key={alert.id} className={alert.readAt ? 'alert-read' : ''}><div className="monitor-section-heading"><strong>{alert.kind === 'FAILURE' ? 'Run failed' : 'Expected run missing'}</strong><span className="tag">{alert.delivery === 'PENDING' ? 'Waiting for delivery' : alert.delivery === 'FAILED' ? 'Delivery failed' : alert.readAt ? 'Read by team' : 'Unread'}</span></div><h3>{alert.workflow.name}</h3><p>{alert.message}</p><time dateTime={alert.createdAt}>{timestamp(alert.createdAt)}</time>{alert.lastError && <p className="help">{alert.lastError}</p>}<div className="alerts-actions">{alert.runId && <Button variant="outline" onClick={() => setRunId(alert.runId)}>View run</Button>}<Button variant="ghost" onClick={() => setWorkflowId(alert.workflow.id)}>View rule</Button>{alert.delivery === 'DELIVERED' && !alert.readAt && <Button disabled={read.isPending} onClick={() => read.mutate(alert.id)}>Mark as read</Button>}</div></li>)}</ul>}
    {!inbox.isError && inbox.data && <div className="monitor-pagination"><Button variant="outline" disabled={page === 1 || inbox.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page} of {inbox.data.totalPages}</span><Button variant="outline" disabled={page >= inbox.data.totalPages || inbox.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
  </section><aside className="monitor-panel"><p className="eyebrow">WORKFLOW RULES</p><h2>Choose what to watch</h2><p className="muted">Rules apply to future activity. Existing alerts stay in the inbox.</p><label>Workflow<select value={workflowId} onChange={e => setWorkflowId(e.target.value)}><option value="">Select a workflow</option>{options.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>{workflows.isError && <p role="alert">Workflow options unavailable. <Button onClick={() => void workflows.refetch()}>Retry</Button></p>}{workflows.hasNextPage && <Button variant="ghost" disabled={workflows.isFetchingNextPage} onClick={() => void workflows.fetchNextPage()}>Load more workflows</Button>}{workflowId && <PolicyPanel key={workflowId} path={path} workflowId={workflowId} owner={space.role === 'OWNER'} userId={userId} />}</aside></div>{runId && <RunDetail key={runId} userId={userId} workspaceId={space.workspaceId} runId={runId} onClose={() => setRunId(null)} />}</>;
}
function PolicyPanel({ path, workflowId, owner, userId }: { path: string; workflowId: string; owner: boolean; userId: string }) {
  const url = path + '/workflows/' + workflowId + '/alert-policy';
  const query = useQuery({ queryKey: ['alert-policy', userId, url], queryFn: () => api<Policy>(url) });
  if (query.isPending) return <p role="status">Loading rule…</p>;
  if (query.isError) return <p role="alert">Rule unavailable. <Button onClick={() => void query.refetch()}>Retry</Button></p>;
  return <PolicyForm key={query.dataUpdatedAt} value={query.data} url={url} owner={owner} />;
}
function PolicyForm({ value, url, owner }: { value: Policy; url: string; owner: boolean }) {
  const [failure, setFailure] = useState(value.failureEnabled);
  const [minutes, setMinutes] = useState(value.expectedMinutes?.toString() ?? '');
  const save = useMutation({ mutationFn: (body: Policy) => api<Policy>(url, 'PUT', body) });
  return <form className="alerts-rule" onSubmit={e => { e.preventDefault(); save.mutate({ failureEnabled: failure, expectedMinutes: minutes === '' ? null : Number(minutes) }); }}><label className="alerts-checkbox"><input type="checkbox" checked={failure} disabled={!owner || save.isPending} onChange={e => { save.reset(); setFailure(e.target.checked); }} />Alert when a run fails</label><label>Expected run interval (minutes)<input type="number" min="1" max="10080" step="1" placeholder="Off" value={minutes} disabled={!owner || save.isPending} onChange={e => { save.reset(); setMinutes(e.target.value); }} /></label><p className="muted">Leave blank to disable missing-run alerts. Allow a little extra time for normal scheduling delays. Changing this interval starts a new observation period.</p>{owner ? <Button disabled={save.isPending} type="submit">{save.isPending ? 'Saving…' : 'Save rule'}</Button> : <p className="muted">Only workspace owners can change rules.</p>}{save.isSuccess && <p role="status">Rule saved. Watching future activity.</p>}{save.isError && <p role="alert" className="help">{save.error.message}</p>}</form>;
}
