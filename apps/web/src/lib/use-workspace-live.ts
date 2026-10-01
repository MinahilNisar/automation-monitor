'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export function useWorkspaceLive(userId: string, workspaceId: string) {
  const client = useQueryClient();
  const [status, setStatus] = useState('Connecting to live updates…');
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    const source = new EventSource(base + '/workspaces/' + workspaceId + '/live', { withCredentials: true });
    const matches = (key: readonly unknown[]) => key.includes(userId) && key.includes(workspaceId);
    source.onopen = () => setStatus('Live updates connected');
    source.onerror = () => setStatus('Reconnecting · periodic refresh remains active');
    source.addEventListener('refresh', () => { void client.invalidateQueries({ predicate: query => matches(query.queryKey) }); });
    source.addEventListener('access-ended', () => {
      source.close(); setRevoked(true); setStatus('Workspace access ended');
      client.removeQueries({ predicate: query => matches(query.queryKey) });
    });
    return () => source.close();
  }, [client, userId, workspaceId]);
  return { status, revoked };
}
