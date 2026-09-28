'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowUpRight, CheckCircle2, CircleAlert, Clock3, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ActivityChart } from './activity-chart';
import { RunDetail } from './run-detail';
import { duration, statusLabel, timestamp, type Overview } from './types';
type User = { id: string; name: string };
type Membership = { workspaceId: string; workspace: { name: string }; role: string };
type Filters = { from: string; to: string; workflowId: string; status: string };
type WorkflowPage = { items: { id: string; name: string }[]; nextCursor: string | null };
const defaults = (): Filters => { const now = new Date(); return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), workflowId: '', status: '' }; };

export function Dashboard() {
  const user = useQuery({ queryKey: ['monitor-session'], queryFn: () => api<User>('/auth/me'), staleTime: 0, refetchOnMount: 'always' });
  return <main className="monitor-page shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-icon">A</span>Automation Monitor</Link><nav aria-label="Main navigation"><Link href="/dashboard" aria-current="page">Dashboard</Link><Link href="/account">Workspace settings <ArrowUpRight size={14} /></Link></nav></header>
    {user.isPending ? <div className="monitor-empty" role="status">Checking your session…</div> : user.isError ? <section className="monitor-panel monitor-empty"><h1>{user.error instanceof ApiError && user.error.status === 401 ? 'Sign in to monitor your workflows.' : 'Unable to connect.'}</h1><p>{user.error instanceof ApiError && user.error.status === 401 ? 'Your execution history is available inside your workspace.' : 'Check that the API is running, then try again.'}</p><Button asChild><Link href="/account">Go to your account</Link></Button><Button variant="outline" onClick={() => void user.refetch()}>Retry connection</Button></section> : <>{user.isFetching && <p role="status">Checking your session…</p>}<div style={{ visibility: user.isFetching ? 'hidden' : undefined }} aria-hidden={user.isFetching}><WorkspaceDashboard key={user.data.id} user={user.data} /></div></>}
    <footer>Automation Monitor · All dates shown in UTC</footer>
  </main>;
}
function WorkspaceDashboard({ user }: { user: User }) {
  const [selected, setSelected] = useState('');
  const spaces = useQuery({ queryKey: ['monitor-workspaces', user.id], queryFn: () => api<Membership[]>('/workspaces') });
  if (spaces.isPending) return <div className="monitor-empty" role="status">Loading workspaces…</div>;
  if (spaces.isError) return <div className="monitor-panel" role="alert"><p>Could not load your workspaces.</p><Button onClick={() => void spaces.refetch()}>Retry workspaces</Button></div>;
  if (!spaces.data.length) return <div className="monitor-panel monitor-empty"><h1>Your monitoring starts here.</h1><p>Create a workspace, register a workflow, and connect its events.</p><Button asChild><Link href="/account">Create a workspace</Link></Button></div>;
  const current = spaces.data.find(space => space.workspaceId === selected) ?? spaces.data[0];
  return <>
    <div className="monitor-heading"><div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>Automation activity<span>.</span></h1><p>A clear view of your runs, from first event to final outcome.</p></div><label className="monitor-workspace">Workspace<select value={current.workspaceId} onChange={event => setSelected(event.target.value)}>{spaces.data.map(space => <option key={space.workspaceId} value={space.workspaceId}>{space.workspace.name}</option>)}</select></label></div>
    <WorkspaceMonitor key={user.id + current.workspaceId} userId={user.id} workspaceId={current.workspaceId} />
  </>;
}
function WorkspaceMonitor({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  const [filters, setFilters] = useState<Filters>(defaults);
  const [draft, setDraft] = useState(filters);
  const [page, setPage] = useState(1);
  const [runId, setRunId] = useState<string | null>(null);
  const [filterError, setFilterError] = useState('');
  const client = useQueryClient();
  const path = '/workspaces/' + workspaceId + '/monitor';
  const params = new URLSearchParams({ from: filters.from, to: filters.to, page: String(page) });
  if (filters.status) params.set('status', filters.status);
  if (filters.workflowId) params.set('workflowId', filters.workflowId);
  const query = useQuery({ queryKey: ['monitor', userId, workspaceId, filters, page], queryFn: () => api<Overview>(path + '?' + params.toString()), refetchInterval: 30000 });
  const workflows = useInfiniteQuery({ queryKey: ['monitor-workflows', userId, workspaceId], initialPageParam: '', queryFn: ({ pageParam }) => api<WorkflowPage>(path + '/workflows' + (pageParam ? '?cursor=' + pageParam : '')), getNextPageParam: last => last.nextCursor ?? undefined });
  const options = workflows.data?.pages.flatMap(result => result.items) ?? [];
  const data = query.isError ? undefined : query.data;
  const closeRun = () => { const previous = runId; setRunId(null); if (previous) document.getElementById('run-' + previous)?.focus(); };
  return <>
    <form className="monitor-filters monitor-panel" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const submitted: Filters = { from: String(fields.get('from') ?? ''), to: String(fields.get('to') ?? ''), workflowId: String(fields.get('workflowId') ?? ''), status: String(fields.get('status') ?? '') };
      setDraft(submitted);
      const difference = (Date.parse(submitted.to) - Date.parse(submitted.from)) / 86400000;
      if (!Number.isFinite(difference) || difference < 0 || difference >= 90) { setFilterError('Choose an ordered date range of 1–90 days.'); return; }
      setFilters(submitted); setPage(1); setRunId(null); setFilterError('');
    }}>
      <label>Workflow<select name="workflowId" value={draft.workflowId} onChange={e => setDraft({ ...draft, workflowId: e.target.value })}><option value="">All workflows</option>{options.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label>Status<select name="status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">All statuses</option><option value="SUCCEEDED">Succeeded</option><option value="FAILED">Failed</option><option value="RUNNING">Running</option></select></label>
      <label>From (UTC)<input name="from" type="date" value={draft.from} required onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>To (UTC)<input name="to" type="date" value={draft.to} required onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
      <Button type="submit">Apply filters</Button><Button type="button" variant="ghost" onClick={() => { const next = defaults(); setDraft(next); setFilters(next); setPage(1); setRunId(null); setFilterError(''); }}>Reset</Button>
      <div className="monitor-filter-help">Dates filter when runs first reached the monitor. Up to 90 days per view.
        {workflows.hasNextPage && <Button type="button" variant="ghost" disabled={workflows.isFetchingNextPage} onClick={() => void workflows.fetchNextPage()}>Load more workflow options</Button>}
        {workflows.isError && <span role="alert"> Workflow options unavailable. <Button type="button" variant="ghost" onClick={() => void workflows.refetch()}>Retry options</Button></span>}
      </div>
      {filterError && <p className="monitor-filter-help help" role="alert">{filterError}</p>}
    </form>
    <div className="monitor-toolbar"><p aria-live="polite">{query.isFetching ? 'Refreshing activity…' : query.isError ? 'Refresh failed' : query.dataUpdatedAt ? 'Updated ' + new Date(query.dataUpdatedAt).toLocaleTimeString() + ' · refreshes every 30s' : 'Loading activity…'}</p><Button variant="outline" disabled={query.isFetching} onClick={() => { void client.invalidateQueries({ queryKey: ['monitor', userId, workspaceId] }); void client.invalidateQueries({ queryKey: ['monitor-detail', userId, workspaceId] }); void client.invalidateQueries({ queryKey: ['monitor-workflows', userId, workspaceId] }); }}><RefreshCw size={15} /> Refresh</Button></div>
    {query.isError ? <section className="monitor-panel monitor-empty" role="alert"><CircleAlert size={30} /><h2>Activity couldn’t be loaded.</h2><p>{query.error instanceof ApiError && [401, 403, 404].includes(query.error.status) ? 'Your session or workspace access may have changed. Check your account.' : 'The server may be unavailable. Your data has not been replaced with empty totals.'}</p><Button onClick={() => void query.refetch()}>Try again</Button><Button variant="outline" asChild><Link href="/account">Account settings</Link></Button></section> : !data ? <section className="monitor-stats" aria-label="Loading dashboard" role="status">{[1, 2, 3, 4].map(item => <div key={item} className="monitor-panel monitor-skeleton">Loading…</div>)}</section> : <>
      <section className="monitor-stats" aria-label="Run summary">
        <Stat label="Total runs" value={String(data.summary.total)} help="Matching the applied filters" icon={<Activity size={19} />} />
        <Stat label="Success rate" value={data.summary.successRate === null ? '—' : data.summary.successRate + '%'} help={data.summary.successRate === null ? 'No finished runs in this view' : data.summary.succeeded + ' of ' + (data.summary.succeeded + data.summary.failed) + ' finished runs'} icon={<CheckCircle2 size={19} />} />
        <Stat label="Failed runs" value={String(data.summary.failed)} help="Reported failed executions" icon={<CircleAlert size={19} />} />
        <Stat label="Running" value={String(data.summary.running)} help="Awaiting a final event" icon={<Clock3 size={19} />} />
      </section>
      <section className="monitor-panel"><div className="monitor-section-heading"><div><p className="eyebrow">EXECUTION VOLUME</p><h2>Daily activity</h2></div><div className="monitor-legend"><span><i className="legend-success" />Succeeded</span><span><i className="legend-failed" />Failed</span><span><i className="legend-running" />Running</span></div></div><p className="muted">{filters.from} — {filters.to} · Current outcomes grouped by received date</p><ActivityChart data={data.daily} /></section>
      <section className="monitor-panel"><div className="monitor-section-heading"><div><p className="eyebrow">EXECUTION HISTORY</p><h2>Recent runs</h2></div><span className="tag">{data.summary.total} matching runs</span></div>
        {!data.items.length ? <div className="monitor-empty"><Activity size={28} /><h3>{data.summary.total ? 'No runs on this page.' : 'No runs match this view.'}</h3><p>{data.summary.total ? 'Go back to the first page to see the latest results.' : 'Adjust your filters or connect a workflow from workspace settings.'}</p>{data.summary.total ? <Button onClick={() => setPage(1)}>First page</Button> : <Button variant="outline" asChild><Link href="/account">Manage workflows <ArrowUpRight size={15} /></Link></Button>}</div> : <div className="monitor-table-scroll"><table><caption className="sr-only">Execution history, newest received first. Times are UTC.</caption><thead><tr><th>Workflow / execution</th><th>Status</th><th>Received (UTC)</th><th>Duration</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.items.map(run => <tr key={run.id} className={run.id === runId ? 'monitor-selected' : ''}><td><strong>{run.workflow.name}</strong><small>{run.externalId}</small></td><td><span className={'monitor-badge ' + run.status}>{statusLabel[run.status]}</span></td><td className="monitor-nowrap">{timestamp(run.createdAt).replace(' UTC', '')}</td><td className="monitor-nowrap">{duration(run)}</td><td><Button id={'run-' + run.id} size="sm" variant="ghost" aria-label={'View execution ' + run.externalId} onClick={() => setRunId(run.id)}>Details <ArrowUpRight size={14} /></Button></td></tr>)}</tbody></table></div>}
        <div className="monitor-pagination"><span>Page {page} of {Math.max(1, data.totalPages)} · 20 per page</span><div><Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => { setPage(value => value - 1); setRunId(null); }}>Previous</Button><Button variant="outline" disabled={page >= data.totalPages || query.isFetching} onClick={() => { setPage(value => value + 1); setRunId(null); }}>Next</Button></div></div>
      </section>
    </>}
    {runId && !query.isError && <RunDetail key={runId} userId={userId} workspaceId={workspaceId} runId={runId} onClose={closeRun} />}
  </>;
}
function Stat({ label, value, help, icon }: { label: string; value: string; help: string; icon: React.ReactNode }) {
  return <article className="monitor-panel monitor-stat"><div><h2>{label}</h2>{icon}</div><strong>{value}</strong><p>{help}</p></article>;
}
