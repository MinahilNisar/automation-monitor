import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createWorkflows } from '../../integrations/n8n/workflows.mjs';
import { compose, waitWebhook } from './lib.mjs';
const workflowId=process.env.WORKFLOW_ID, key=process.env.INGEST_API_KEY;
if(!workflowId || !/^[0-9a-f-]{36}$/i.test(workflowId) || !key || !/^amk_[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Set WORKFLOW_ID and INGEST_API_KEY from your monitor workflow first. See docs/PHASE-06.md.');
if(existsSync('.data/n8n-connection.json')) throw new Error('A connection already exists. Revoke/rotate credentials in n8n and your monitor; this command will not overwrite it.');
mkdirSync('.data/n8n-import',{recursive:true});
const webhookKey=randomBytes(32).toString('base64url');
const built=createWorkflows({workflowId});
const credentialFile='.data/n8n-import/credentials.json';
writeFileSync(credentialFile,JSON.stringify([
  {...built.monitorCredential,type:'httpHeaderAuth',data:{name:'Authorization',value:'Bearer '+key}},
  {...built.webhookCredential,type:'httpHeaderAuth',data:{name:'X-Order-Key',value:webhookKey}},
]),{mode:0o600});
writeFileSync('.data/n8n-import/workflows.json',JSON.stringify([built.errors,built.main],null,2));
try {
  compose(['stop','n8n']);
  compose(['run','--rm','--no-deps','n8n','import:credentials','--input=/imports/credentials.json']);
  compose(['run','--rm','--no-deps','n8n','import:workflow','--input=/imports/workflows.json']);
  compose(['run','--rm','--no-deps','n8n','publish:workflow','--id='+built.errors.id]);
  compose(['run','--rm','--no-deps','n8n','publish:workflow','--id='+built.main.id]);
  mkdirSync('.data/n8n-monitor',{recursive:true});
  writeFileSync('.data/n8n-monitor/n8n-connection.json',JSON.stringify({replayVersion:1,workflowId,webhookKey}),{mode:0o600});
  writeFileSync('.data/n8n-connection.json',JSON.stringify({replayVersion:1,workflowId,webhookUrl:'http://localhost:5678/webhook/automation-monitor/orders',webhookKey},null,2),{mode:0o600});
} finally {
  if(existsSync(credentialFile)) unlinkSync(credentialFile);
  compose(['up','-d','--wait','n8n']);
}
await waitWebhook('http://localhost:5678/webhook/automation-monitor/orders');
console.log('Connected. Credentials are stored by n8n; local webhook settings are in ignored .data/n8n-connection.json. Run npm run demo:n8n.');
