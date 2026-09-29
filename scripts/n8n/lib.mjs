import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
export function compose(args, {capture=false}={}) {
  const result=spawnSync(process.execPath,[resolve('scripts/docker.mjs'),'-f','compose.yaml','-f','compose.n8n.yaml',...args],{windowsHide:true,encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(result.status!==0) throw new Error('Docker Compose operation failed: '+args[0]+(capture?'\n'+result.stderr:''));
  return result.stdout?.trim();
}
export async function waitReady(url, milliseconds=120000) {
  const end=Date.now()+milliseconds;
  while(Date.now()<end) {
    try { const response=await fetch(url,{signal:AbortSignal.timeout(3000)});if(response.ok)return; } catch {}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Service did not become ready: '+url);
}

// Probe without credentials: a protected, registered webhook rejects before execution.
export async function waitWebhook(url, milliseconds=60000) {
  const end=Date.now()+milliseconds;
  while(Date.now()<end) {
    let response;
    try { response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)}); } catch {}
    if(response && [401,403].includes(response.status)) return;
    if(response?.ok) throw new Error('Webhook unexpectedly accepts unauthenticated requests. Check Header Auth.');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Protected webhook did not become ready. Check that both n8n workflows are published.');
}
