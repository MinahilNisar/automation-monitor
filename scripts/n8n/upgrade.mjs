import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createWorkflows } from '../../integrations/n8n/workflows.mjs';
import { compose, waitWebhook } from './lib.mjs';
const config = JSON.parse(readFileSync('.data/n8n-connection.json','utf8'));
if (!/^[0-9a-f-]{36}$/i.test(config.workflowId) || !/^[A-Za-z0-9_-]{43}$/.test(config.webhookKey)) throw new Error('Invalid local sample connection.');
const built = createWorkflows({ workflowId: config.workflowId });
mkdirSync('.data/n8n-import',{recursive:true});
writeFileSync('.data/n8n-import/workflows.json',JSON.stringify([built.errors,built.main],null,2));
console.log('Updating the two generated sample workflows; existing n8n credentials are reused.');
try {
  compose(['stop','n8n']);
  compose(['run','--rm','--no-deps','n8n','import:workflow','--input=/imports/workflows.json']);
  compose(['run','--rm','--no-deps','n8n','publish:workflow','--id='+built.errors.id]);
  compose(['run','--rm','--no-deps','n8n','publish:workflow','--id='+built.main.id]);
  mkdirSync('.data/n8n-monitor',{recursive:true});
  writeFileSync('.data/n8n-monitor/n8n-connection.json',JSON.stringify({workflowId:config.workflowId,webhookKey:config.webhookKey,replayVersion:1}),{mode:0o600});
  writeFileSync('.data/n8n-connection.json',JSON.stringify({...config,replayVersion:1},null,2),{mode:0o600});
} finally { compose(['up','-d','--wait','n8n']); }
await waitWebhook('http://localhost:5678/webhook/automation-monitor/orders');
console.log('Phase 8 sample ready. New runs will include replay input; existing runs remain unchanged.');
