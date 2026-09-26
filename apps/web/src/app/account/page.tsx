'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
type User = { id: string; name: string; email: string };
type Membership = { workspaceId: string; role: 'OWNER' | 'MEMBER'; workspace: { id: string; name: string } };
type Member = { role: 'OWNER' | 'MEMBER'; user: User };
type Workflow = { id: string; name: string; slug: string; _count: { runs: number } };
type Run = { id: string; status: string; startedAt: string; events: { id: string; message: string }[] };
type Panel = { members: Member[]; workflows: Workflow[] };
const errorText = (error: unknown) => error instanceof ApiError ? error.message : 'Cannot reach the server. Check your connection and try again.';

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [runs, setRuns] = useState<{ name: string; values: Run[] } | null>(null);

  useEffect(() => {
    let active = true;
    void api<User>('/auth/me').then(async current => {
      const spaces = await api<Membership[]>('/workspaces');
      if (active) { setUser(current); setMemberships(spaces); setSelected(spaces[0]?.workspaceId ?? ''); }
    }).catch(e => { if (active && !(e instanceof ApiError && e.status === 401)) setError(errorText(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !selected) return;
    let active = true;
    void Promise.all([api<Member[]>('/workspaces/' + selected + '/members'), api<Workflow[]>('/workspaces/' + selected + '/workflows')])
      .then(([members, workflows]) => { if (active) setPanel({ members, workflows }); })
      .catch(e => { if (active) { setError(errorText(e)); if (e instanceof ApiError && e.status === 401) { setUser(null); setPanel(null); } } });
    return () => { active = false; };
  }, [selected, user]);

  async function action(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(errorText(e)); if (e instanceof ApiError && e.status === 401) { setUser(null); setPanel(null); setRuns(null); } }
    finally { setBusy(false); }
  }
  async function refreshPanel() {
    const [members, workflows] = await Promise.all([api<Member[]>('/workspaces/' + selected + '/members'), api<Workflow[]>('/workspaces/' + selected + '/workflows')]);
    setPanel({ members, workflows });
  }
  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void action(async () => {
      const body = { email: data.get('email'), password: data.get('password'), ...(register ? { name: data.get('name'), workspaceName: data.get('workspaceName') } : {}) };
      const current = await api<User>(register ? '/auth/register' : '/auth/login', 'POST', body);
      const spaces = await api<Membership[]>('/workspaces');
      setPanel(null); setRuns(null); setUser(current); setMemberships(spaces); setSelected(spaces[0]?.workspaceId ?? ''); form.reset();
    });
  }
  const membership = memberships.find(item => item.workspaceId === selected);
  return <main className="shell account-shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-icon">A</span>Automation Monitor</Link><Link className="account-back" href="/">Overview ↗</Link></header>
    <div className="account-heading"><p className="eyebrow">YOUR TEAM, YOUR SPACE</p><h1>{user ? 'Welcome, ' + user.name + '.' : 'A workspace for your automations.'}</h1><p className="description">Keep your workflows organized and give your team the right access.</p></div>
    {error && <div role="alert" className="account-error">{error}</div>}
    {notice && <div role="status" className="account-notice">{notice}</div>}
    {loading ? <p role="status">Checking your session…</p> : !user ? <div className="account-login-grid">
      <section className="card"><div className="account-tabs"><button type="button" disabled={busy} aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Sign in</button><button type="button" disabled={busy} aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Create account</button></div>
        <h2>{register ? 'Create your account' : 'Good to see you again'}</h2>
        <form onSubmit={authenticate} className="account-form">
          {register && <><label>Your name<input name="name" autoComplete="name" required maxLength={80} /></label><label>Workspace name<input name="workspaceName" required maxLength={80} placeholder="My team" /></label></>}
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} aria-describedby="password-help" /></label>
          <small id="password-help" className="muted">Use 12–128 characters.</small><button disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account & workspace' : 'Sign in'}</button>
        </form>
      </section><aside className="card account-intro"><p className="eyebrow">WORK BETTER TOGETHER</p><h2>Start with a space<br />of your own.</h2><p>Your account comes with a workspace. Create workflows, add registered teammates, and switch between the teams you belong to.</p><p>Workspace owners manage membership. Members can view and create workflows.</p></aside>
    </div> : <>
      <section className="card account-toolbar"><label>Active workspace<select aria-label="Active workspace" value={selected} disabled={busy} onChange={e => { setPanel(null); setRuns(null); setError(''); setNotice(''); setSelected(e.target.value); }}>{memberships.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.workspace.name}</option>)}</select></label><span className="pill">{membership?.role ?? 'No workspace'}</span><button disabled={busy} onClick={() => void action(async () => { await api('/auth/logout', 'POST'); setUser(null); setMemberships([]); setSelected(''); setPanel(null); setRuns(null); setNotice('You have signed out.'); })}>Sign out</button></section>
      <div className="account-login-grid account-workspaces">
        <section className="card"><h2>Create a workspace</h2><form className="account-form" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const name = new FormData(form).get('name'); void action(async () => { const created = await api<{ id: string }>('/workspaces', 'POST', { name }); const spaces = await api<Membership[]>('/workspaces'); setMemberships(spaces); setPanel(null); setRuns(null); setSelected(created.id); form.reset(); setNotice('Workspace created.'); }); }}><label>Workspace name<input name="name" required maxLength={80} placeholder="Operations team" /></label><button disabled={busy}>Create workspace</button></form></section>
        <section className="card"><h2>Team members</h2>{!panel ? <p className="muted">{error ? 'Unable to load this workspace.' : 'Loading members…'}</p> : <ul className="account-list">{panel.members.map(member => <li key={member.user.id}><span><strong>{member.user.name}</strong><small>{member.user.email} · {member.role.toLowerCase()}</small></span>{membership?.role === 'OWNER' && member.role === 'MEMBER' && <button disabled={busy} aria-label={'Remove ' + member.user.name} onClick={() => void action(async () => { await api('/workspaces/' + selected + '/members/' + member.user.id, 'DELETE'); await refreshPanel(); setNotice('Member removed.'); })}>Remove</button>}</li>)}</ul>}
          {membership?.role === 'OWNER' && <form className="account-form" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const email = new FormData(form).get('email'); void action(async () => { await api('/workspaces/' + selected + '/members', 'POST', { email }); await refreshPanel(); form.reset(); setNotice('Member added.'); }); }}><label>Add a registered teammate<input name="email" type="email" required maxLength={254} placeholder="teammate@example.com" /></label><small className="muted">They must already have an account. This adds access directly; no email is sent.</small><button disabled={busy}>Add member</button></form>}
        </section>
      </div>
      <section className="card account-workflow-card"><div className="account-section-title"><h2>Workflows</h2><span className="tag">{panel?.workflows.length ?? 0} in this workspace</span></div>{!panel ? <p className="muted">{error ? 'Unable to load workflows.' : 'Loading workflows…'}</p> : panel.workflows.length === 0 ? <p className="muted">No workflows yet. Register your first workflow below.</p> : <ul className="account-list">{panel.workflows.map(workflow => <li key={workflow.id}><span><strong>{workflow.name}</strong><small>{workflow.slug} · {workflow._count.runs} runs</small></span><button disabled={busy} onClick={() => void action(async () => { const values = await api<Run[]>('/workspaces/' + selected + '/workflows/' + workflow.id + '/runs'); setRuns({ name: workflow.name, values }); })}>View runs</button></li>)}</ul>}
        <form className="account-form account-inline-form" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const data = new FormData(form); void action(async () => { await api('/workspaces/' + selected + '/workflows', 'POST', { name: data.get('name'), slug: data.get('slug') }); await refreshPanel(); form.reset(); setNotice('Workflow created. Connect its events in a later phase.'); }); }}><label>Workflow name<input name="name" required maxLength={80} placeholder="Daily sales report" /></label><label>Unique slug<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="daily-sales-report" /></label><button disabled={busy || !selected}>Add workflow</button></form>
      </section>
      {runs && <section className="card account-workflow-card"><h2>{runs.name}: execution history</h2>{runs.values.length === 0 ? <p className="muted">No executions reported yet.</p> : <ul className="account-list">{runs.values.map(run => <li key={run.id}><span><strong>{run.status}</strong><small>{new Date(run.startedAt).toLocaleString()}</small>{run.events.map(event => <p key={event.id}>{event.message}</p>)}</span></li>)}</ul>}</section>}
    </>}
    <footer>Access is limited to the workspaces you belong to.</footer>
  </main>;
}
