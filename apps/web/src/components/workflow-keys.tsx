'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
type Key = { id: string; label: string; expiresAt: string; revokedAt: string | null };
export function WorkflowKeys({ workspaceId, workflowId, name }: { workspaceId: string; workflowId: string; name: string }) {
  const path = '/workspaces/' + workspaceId + '/workflows/' + workflowId + '/keys';
  const [keys, setKeys] = useState<Key[]>([]);
  const [secret, setSecret] = useState<{ id: string; key: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<Key[]>(path).then(values => { if (active) setKeys(values); }).catch(() => { if (active) setError('Unable to load keys. Try reopening this panel.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);
  async function action(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Cannot reach the server. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="card account-workflow-card">
    <p className="eyebrow">CONNECT YOUR AUTOMATION</p><h2>{name}: API keys</h2>
    <p>Each key can send events only to this workflow. Keys expire after 90 days. Save new keys in your automation tool’s secret storage.</p>
    <p>Event endpoint: <code className="key-endpoint">{(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001') + '/ingest/workflows/' + workflowId + '/events'}</code></p>
    {error && <div role="alert" className="account-error">{error}</div>}
    {secret && <div className="account-notice"><strong>Save this key now. It will only be shown once.</strong><label className="key-label">New API key<textarea aria-label="New API key" readOnly value={secret.key} spellCheck={false} /></label><button type="button" onClick={() => setSecret(null)}>I saved it — hide key</button></div>}
    <form className="account-form" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const label = new FormData(form).get('label');
      void action(async () => { const created = await api<Key & { key: string }>(path, 'POST', { label }); setSecret({ id: created.id, key: created.key }); setKeys(previous => [{ id: created.id, label: created.label, expiresAt: created.expiresAt, revokedAt: created.revokedAt }, ...previous].slice(0, 100)); form.reset(); });
    }}><label>Key label<input name="label" placeholder="Sales workflow connection" required maxLength={64} /></label><button disabled={busy || loading || !!secret}>Generate API key</button></form>
    {loading ? <p role="status">Loading keys…</p> : keys.length === 0 ? <p>No keys yet.</p> : <ul className="account-list">{keys.map(key => <li key={key.id}><span><strong>{key.label}</strong><small>{key.revokedAt ? 'Revoked' : 'Expires ' + new Date(key.expiresAt).toLocaleDateString()}</small></span>{!key.revokedAt && <button disabled={busy} aria-label={'Revoke ' + key.label} onClick={() => void action(async () => { await api(path + '/' + key.id, 'DELETE'); setKeys(previous => previous.map(item => item.id === key.id ? { ...item, revokedAt: new Date().toISOString() } : item)); if (secret?.id === key.id) setSecret(null); })}>Revoke</button>}</li>)}</ul>}
    <p className="muted">Showing the newest 100 keys. To rotate a connection, create a replacement, update your automation, then revoke the old key.</p>
  </section>;
}
