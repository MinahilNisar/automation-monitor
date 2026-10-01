import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
const connectionSchema = z.object({ workflowId: z.string().uuid(), webhookKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/), replayVersion: z.literal(1) });
type Connection = z.infer<typeof connectionSchema>;
@Injectable()
export class RerunAdapter {
  async connection(workflowId: string): Promise<Connection | null> {
    try {
      const file = process.env.N8N_CONNECTION_FILE ?? resolve('../../.data/n8n-monitor/n8n-connection.json');
      const parsed = connectionSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      return parsed.workflowId === workflowId ? parsed : null;
    } catch { return null; }
  }
  async send(connection: Connection, input: { orderId: string; amount: number }, requestId: string): Promise<'OBSERVED' | 'REJECTED' | 'UNCERTAIN'> {
    // Deployment configuration only. No URL, credential or redirect is supplied by the browser.
    const base = process.env.N8N_WEBHOOK_ORIGIN ?? 'http://localhost:5678';
    const url = new URL('/webhook/automation-monitor/orders', base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'REJECTED';
    try {
      const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-Order-Key': connection.webhookKey }, body: JSON.stringify({ ...input, rerunRequestId: requestId }), signal: AbortSignal.timeout(8000) });
      // Events, not a webhook HTTP response, establish which run actually executed.
      await response.body?.cancel();
      return [401, 403, 404].includes(response.status) ? 'REJECTED' : 'UNCERTAIN';
    } catch { return 'UNCERTAIN'; }
  }
}
