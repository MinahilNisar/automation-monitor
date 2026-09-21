'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type Connection = 'checking' | 'connected' | 'offline';

async function getConnection(): Promise<Connection> {
  try {
    const response = await fetch(apiUrl + '/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return 'offline';
    const data = await response.json();
    return data.status === 'ok' && data.service === 'automation-monitor-api' ? 'connected' : 'offline';
  } catch {
    return 'offline';
  }
}

export default function Home() {
  const [connection, setConnection] = useState<Connection>('checking');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const checkConnection = useCallback(async () => {
    setConnection('checking');
    const result = await getConnection();
    setConnection(result);
    setCheckedAt(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    let active = true;
    void getConnection().then((result) => {
      if (active) {
        setConnection(result);
        setCheckedAt(new Date().toLocaleTimeString());
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Automation Monitor home"><span className="brand-icon">A</span>Automation Monitor</Link>
        <span className="tag">Development preview</span>
      </header>
      <section className="intro">
        <p className="eyebrow">YOUR AUTOMATIONS, IN VIEW</p>
        <h1>A clear view of<br />every workflow.</h1>
        <p className="description">One place to track execution, investigate failures, and keep your automations running reliably.</p>
      </section>
      <section className="connection card" aria-labelledby="connection-title">
        <div>
          <p className="eyebrow">SYSTEM CONNECTION</p>
          <h2 id="connection-title">Frontend meets backend.</h2>
          <p className="muted">Your Next.js dashboard checks the NestJS API directly.</p>
        </div>
        <div className="connection-action">
          <div role="status" aria-live="polite" className={'status ' + connection}>
            <span className="dot" />{connection === 'connected' ? 'API connected' : connection === 'checking' ? 'Checking connection...' : 'API unavailable'}
          </div>
          <button onClick={() => void checkConnection()} disabled={connection === 'checking'}>Check connection <span aria-hidden="true">↗</span></button>
          <small className="muted">{checkedAt ? 'Last checked ' + checkedAt : 'Waiting for the first response'}</small>
        </div>
      </section>
      {connection === 'offline' && <p className="help">Start the backend with <code>npm run dev:api</code> from the project folder, then check again.</p>}
      <section className="grid" aria-label="Project foundation">
        <article className="card"><span className="number">01 / INTERFACE</span><h2>Next.js + React</h2><p>TypeScript, responsive styling, and a foundation for your monitoring dashboard.</p><span className="pill">Ready</span></article>
        <article className="card"><span className="number">02 / API</span><h2>NestJS + Node.js</h2><p>A separate backend with a health endpoint, local CORS configuration, and automated checks.</p><span className="pill">Scaffolded</span></article>
        <article className="card"><span className="number">03 / NEXT MILESTONE</span><h2>Your first execution</h2><p>Receive a workflow event, save it to PostgreSQL, and display its execution history here.</p><span className="pill next">Coming next</span></article>
      </section>
      <footer>No workflows connected yet. This page verifies your project foundation.</footer>
    </main>
  );
}
