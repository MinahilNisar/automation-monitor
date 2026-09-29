import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createWorkflows } from '../../integrations/n8n/workflows.mjs';
import { compose, waitReady } from './lib.mjs';
import { PrismaPg } from '../../apps/api/node_modules/@prisma/adapter-pg/dist/index.mjs';
import { PrismaClient } from '../../apps/api/dist/generated/prisma/client.js';
if(process.env.NODE_ENV==='production') throw new Error('Local integration test only.');
process.loadEnvFile('apps/api/.env');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const token=randomBytes(8).toString('hex'),service='n8n-check-'+token;
const folder=resolve('.data',service), imports=folder+'/imports';
mkdirSync(imports,{recursive:true});mkdirSync(folder+'/data',{recursive:true});
const override=folder+'/compose.json';
writeFileSync(override,JSON.stringify({services:{[service]:{image:'n8nio/n8n:2.40.7',ports:['127.0.0.1:5679:5678'],environment:{N8N_DIAGNOSTICS_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'true',EXECUTIONS_DATA_SAVE_ON_ERROR:'all',EXECUTIONS_DATA_SAVE_ON_SUCCESS:'all'},volumes:[folder+'/data:/home/node/.n8n',imports+':/imports:ro']}}}));
const run=args=>compose(['-f',override,...args],{capture:true});
const base='http://localhost:3002';let userId,workspaceId,checks=0;
async function api(path,{method='GET',cookie,body,status=200,key}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:process.env.FRONTEND_URL??'http://localhost:3000','X-Requested-With':'AutomationMonitor',...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,status,method+' '+path);checks++;
  return {data:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function until(read,accept) {const end=Date.now()+45000;while(Date.now()<end){const result=await read();if(accept(result))return result;await new Promise(r=>setTimeout(r,500));}throw new Error('Expected n8n event did not arrive.');}
try {
  await waitReady(base+'/health');
  const account=await api('/auth/register',{method:'POST',status:201,body:{name:'n8n integration test',email:'n8n-'+token+'@example.test',password:randomBytes(24).toString('hex'),workspaceName:'n8n integration test'}});userId=account.data.id;
  workspaceId=(await api('/workspaces',{cookie:account.cookie})).data[0].workspaceId;
  const workflow=(await api('/workspaces/'+workspaceId+'/workflows',{method:'POST',cookie:account.cookie,status:201,body:{name:'Order validation',slug:'orders'}})).data;
  const keyPath='/workspaces/'+workspaceId+'/workflows/'+workflow.id+'/keys';
  const key=(await api(keyPath,{method:'POST',cookie:account.cookie,status:201,body:{label:'n8n integration check'}})).data;
  const webhookKey=randomBytes(32).toString('base64url');
  const built=createWorkflows({workflowId:workflow.id,prefix:'check'+token,webhookPath:'check-'+token});
  writeFileSync(imports+'/credentials.json',JSON.stringify([{...built.monitorCredential,type:'httpHeaderAuth',data:{name:'Authorization',value:'Bearer '+key.key}},{...built.webhookCredential,type:'httpHeaderAuth',data:{name:'X-Order-Key',value:webhookKey}}]),{mode:0o600});
  writeFileSync(imports+'/workflows.json',JSON.stringify([built.errors,built.main]));
  console.log('Importing test credentials and real n8n workflows…');
  run(['run','--rm','--no-deps',service,'import:credentials','--input=/imports/credentials.json']);
  unlinkSync(imports+'/credentials.json');
  run(['run','--rm','--no-deps',service,'import:workflow','--input=/imports/workflows.json']);
  run(['run','--rm','--no-deps',service,'publish:workflow','--id='+built.errors.id]);
  run(['run','--rm','--no-deps',service,'publish:workflow','--id='+built.main.id]);
  run(['up','-d','--no-deps',service]);
  await waitReady('http://localhost:5679/healthz');
  const webhook='http://localhost:5679/webhook/check-'+token;
  const order=async(body,authorized=true)=>fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{'X-Order-Key':webhookKey}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  // healthz can become ready before published webhooks finish registering.
  const unauthorized=await until(()=>order({orderId:'test-order',amount:100},false),response=>response.status!==404);
  assert.ok([401,403].includes(unauthorized.status),'Webhook must reject missing credentials');checks++;
  console.log('Running valid and invalid orders through the published webhook…');
  const valid=await order({orderId:'test-order',amount:100});assert.equal(valid.status,200);checks++;
  const receipt=await valid.json();assert.equal(receipt.receipt.total,110);assert.equal(receipt.receipt.tax,10);assert.match(receipt.executionId,/^n8n:/);
  const invalid=await order({orderId:'invalid-order',amount:-1});assert.equal(invalid.status,500);checks++;
  const runsPath='/workspaces/'+workspaceId+'/workflows/'+workflow.id+'/runs';
  const rows=await until(()=>api(runsPath,{cookie:account.cookie}).then(r=>r.data),rows=>rows.length===2&&rows.some(r=>r.status==='FAILED')&&rows.some(r=>r.status==='SUCCEEDED'));
  const succeeded=rows.find(r=>r.status==='SUCCEEDED'),failed=rows.find(r=>r.status==='FAILED');
  assert.equal(succeeded.externalId,receipt.executionId);assert.deepEqual(succeeded.events.map(e=>e.type),['STARTED','COMPLETED']);assert.deepEqual(failed.events.map(e=>e.type),['STARTED','FAILED']);assert.notEqual(failed.externalId,succeeded.externalId);
  const event=succeeded.events.find(e=>e.type==='COMPLETED');
  const replay=(await api('/ingest/workflows/'+workflow.id+'/events',{method:'POST',key:key.key,body:{runId:succeeded.externalId,eventId:event.externalId,type:event.type,occurredAt:event.occurredAt,message:event.message}})).data;assert.equal(replay.duplicate,true);
  const today=new Date().toISOString().slice(0,10);
  const overview=(await api('/workspaces/'+workspaceId+'/monitor?from='+today+'&to='+today,{cookie:account.cookie})).data;
  assert.deepEqual(overview.summary,{total:2,running:0,succeeded:1,failed:1,successRate:50});
  await api('/workspaces/'+workspaceId+'/monitor/runs/'+failed.id,{cookie:account.cookie});
  const again=await order({orderId:'test-order',amount:100});assert.equal(again.status,200);assert.notEqual((await again.json()).executionId,receipt.executionId);checks++;
  await until(()=>api(runsPath,{cookie:account.cookie}).then(r=>r.data),rows=>rows.length===3&&rows.filter(r=>r.status==='SUCCEEDED').length===2);
  await api(keyPath+'/'+key.id,{method:'DELETE',cookie:account.cookie,status:204});
  assert.equal((await order({orderId:'revoked-key',amount:100})).status,500);checks++;
  assert.equal((await api(runsPath,{cookie:account.cookie})).data.length,3);
  console.log(JSON.stringify({httpAssertions:checks,realN8nSuccess:'passed',realN8nErrorWorkflow:'passed',receiptCalculation:'passed',dashboardTotals:'passed',eventReplay:'passed',webhookAuthentication:'passed',revokedMonitorKey:'passed'}));
} finally {
  // Remove only the uniquely named test service; never stop the user's n8n service.
  try{run(['rm','--stop','--force',service]);}catch{console.error('Could not remove temporary n8n service: '+service);}
  if(existsSync(imports+'/credentials.json'))unlinkSync(imports+'/credentials.json');
  if(userId)await db.$transaction(async tx=>{
    const memberships=await tx.membership.findMany({where:{userId}});const ids=memberships.map(m=>m.workspaceId);
    await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:ids}}}}});
    await tx.run.deleteMany({where:{workflow:{workspaceId:{in:ids}}}});await tx.workflow.deleteMany({where:{workspaceId:{in:ids}}});await tx.workspace.deleteMany({where:{id:{in:ids}}});await tx.user.delete({where:{id:userId}});
  });
  await db.$disconnect();
  console.log('Temporary test container and monitor records cleaned; local n8n test database retained under '+folder+' for inspection.');
}
