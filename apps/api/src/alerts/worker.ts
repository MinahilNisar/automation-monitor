import { existsSync } from 'node:fs';
import { PrismaService } from '../database/prisma.service.js';
import { AlertsEngine } from './alerts.engine.js';
if (existsSync('.env')) process.loadEnvFile('.env');
const database = new PrismaService();
const engine = new AlertsEngine(database.client);
const worker = engine.createWorker();
let scanning: Promise<void> | undefined;
let dispatching: Promise<void> | undefined;
let stopping = false;
function tick() {
  if (stopping) return;
  // Redis reconnects must not block missing-run detection in PostgreSQL.
  scanning ??= engine.scanMissing().catch(() => console.error('Missing-run scan failed; it will retry.')).finally(() => { scanning = undefined; });
  dispatching ??= engine.dispatch().catch(() => console.error('Alert dispatch failed; pending records will retry.')).finally(() => { dispatching = undefined; });
}
const timer = setInterval(tick, 15000);
tick();
console.log('Alert worker started. Scans every 15 seconds; inbox delivery uses BullMQ.');
async function stop() {
  if (stopping) return;
  stopping = true; clearInterval(timer);
  const deadline = setTimeout(() => { console.error('Worker shutdown timed out; persisted jobs will recover on restart.'); process.exit(1); }, 15000);
  await Promise.allSettled([scanning, dispatching]);
  await worker.close(); await engine.close(); await database.onModuleDestroy();
  clearTimeout(deadline);
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
