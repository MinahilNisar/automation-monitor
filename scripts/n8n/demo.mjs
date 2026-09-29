import { waitWebhook } from './lib.mjs';
import { readFileSync } from 'node:fs';
const config=JSON.parse(readFileSync('.data/n8n-connection.json','utf8'));
await waitWebhook(config.webhookUrl);
for(const [label,body] of [['valid',{orderId:'demo-valid-'+Date.now(),amount:100}],['invalid',{orderId:'demo-invalid-'+Date.now(),amount:-1}]]) {
  const response=await fetch(config.webhookUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Order-Key':config.webhookKey},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  // No credential values or raw workflow inputs are printed.
  console.log(label+' order: HTTP '+response.status);
  if(label==='valid'&&!response.ok) throw new Error('Valid order failed. Inspect n8n executions.');
  if(label==='invalid'&&response.status!==500) throw new Error('Expected HTTP 500 for the deliberate validation failure. Inspect n8n executions.');
}
console.log('Open the monitor dashboard and select your connected workflow. Allow a few seconds for the error workflow to report FAILED.');
