import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Local development tests only.');
const suffix=randomBytes(8).toString('hex');
const users=[], spaces=[];
let app,db,base,checks=0;
async function start() { app=await NestFactory.create(AppModule,{logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();db=app.get(PrismaService).client; }
async function call(path,{method='GET',body,cookie,key,status=200,machine=false}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(!machine?{Origin:process.env.FRONTEND_URL??'http://localhost:3000','X-Requested-With':'AutomationMonitor'}:{}),...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,status,method+' '+path);checks++;
  return {data:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try {
  await start();
  async function register(label) {
    const result=await call('/auth/register',{method:'POST',status:201,body:{name:label,email:label+'-'+suffix+'@example.test',password:randomBytes(24).toString('hex'),workspaceName:'Ingestion test'}});
    users.push(result.data.id);
    const workspace=(await call('/workspaces',{cookie:result.cookie})).data[0].workspaceId;spaces.push(workspace);
    return {...result,workspace};
  }
  const a=await register('ingest-owner'), b=await register('ingest-other');
  const wp='/workspaces/'+a.workspace;
  const wf=(await call(wp+'/workflows',{method:'POST',cookie:a.cookie,status:201,body:{name:'Ingest test',slug:'ingest'}})).data;
  const other=(await call(wp+'/workflows',{method:'POST',cookie:a.cookie,status:201,body:{name:'Other',slug:'other'}})).data;
  const kp=wp+'/workflows/'+wf.id+'/keys', ep='/ingest/workflows/'+wf.id+'/events';
  const startEvent={runId:'run-1',eventId:'start',type:'STARTED',occurredAt:'2026-01-01T10:00:00.000Z',message:'Started'};
  const end={...startEvent,eventId:'end',type:'COMPLETED',occurredAt:'2026-01-01T10:00:10.000Z',message:'Done'};
  await call(kp,{cookie:b.cookie,status:404});
  await call(wp+'/members',{method:'POST',cookie:a.cookie,status:201,body:{email:b.data.email}});
  await call(kp,{cookie:b.cookie,status:403});
  await call(kp,{method:'POST',cookie:b.cookie,status:403,body:{label:'Forbidden'}});
  await call(kp,{method:'POST',cookie:a.cookie,machine:true,status:403,body:{label:'No origin'}});
  await call(kp,{method:'POST',cookie:a.cookie,status:400,body:{label:''}});
  const key=(await call(kp,{method:'POST',cookie:a.cookie,status:201,body:{label:'Test connection'}})).data;
  assert.match(key.key,/^amk_[A-Za-z0-9_-]{43}$/);
  const stored=await db.workflowApiKey.findUniqueOrThrow({where:{id:key.id}});
  assert.equal(stored.keyHash,createHash('sha256').update(key.key).digest('hex'));
  const listed=(await call(kp,{cookie:a.cookie})).data;
  assert.ok(listed.every(row=>!('key' in row)&&!('keyHash' in row)));
  await call('/workspaces',{key:key.key,status:401});
  await call(ep,{method:'POST',body:startEvent,machine:true,status:401});
  await call(ep,{method:'POST',body:startEvent,machine:true,cookie:a.cookie,status:401});
  await call(ep,{method:'POST',body:startEvent,machine:true,key:'invalid',status:401});
  await call('/ingest/workflows/'+other.id+'/events',{method:'POST',body:startEvent,machine:true,key:key.key,status:401});
  const send=(body,status=200)=>call(ep,{method:'POST',body,machine:true,key:key.key,status}).then(r=>r.data);
  const first=await send(startEvent);assert.equal(first.duplicate,false);assert.equal(first.run.status,'RUNNING');
  const completed=await send(end);assert.equal(completed.run.status,'SUCCEEDED');
  const duplicate=await send(end);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.event.id,completed.event.id);
  await send({...end,message:'changed'},409);
  await send({...end,eventId:'conflict',type:'FAILED'},409);
  await send({...end,eventId:'changed-finish',occurredAt:'2026-01-01T10:00:11.000Z'},409);
  assert.equal(await db.runEvent.count({where:{runId:first.run.id}}),2);
  const late=await send({...end,runId:'late'});assert.equal(late.run.startedAt,null);
  const filled=await send({...startEvent,runId:'late'});assert.equal(filled.run.status,'SUCCEEDED');assert.equal(filled.run.startedAt,startEvent.occurredAt);
  await send({...startEvent,runId:'late',eventId:'bad-start',occurredAt:'2026-01-01T10:01:00.000Z'},409);
  await send({...startEvent,runId:'chronology'});
  await send({...end,runId:'chronology',occurredAt:'2026-01-01T09:59:00.000Z'},409);
  const failed=await send({...end,runId:'failed',type:'FAILED'});assert.equal(failed.run.status,'FAILED');
  const concurrent=await Promise.all(Array.from({length:8},()=>send({...startEvent,runId:'concurrent'})));
  assert.equal(concurrent.filter(r=>!r.duplicate).length,1);assert.equal(new Set(concurrent.map(r=>r.event.id)).size,1);
  await Promise.all([send({...startEvent,runId:'parallel'}),send({...end,runId:'parallel'})]);
  const parallel=await db.run.findUniqueOrThrow({where:{workflowId_externalId:{workflowId:wf.id,externalId:'parallel'}}});
  assert.equal(parallel.status,'SUCCEEDED');assert.equal(parallel.startedAt.toISOString(),startEvent.occurredAt);
  for(const patch of [{type:'UNKNOWN'},{occurredAt:'bad'},{occurredAt:new Date(Date.now()+86400000).toISOString()},{occurredAt:'2026-01-01T10:00:00.1234Z'},{message:'x'.repeat(2001)},{unexpected:true},{eventId:''}]) await send({...startEvent,runId:'invalid',...patch},400);
  assert.equal(await db.run.count({where:{workflowId:wf.id,externalId:'invalid'}}),0);
  assert.ok((await call(wp+'/workflows/'+wf.id+'/runs',{cookie:a.cookie})).data.some(run=>run.id===first.run.id));
  await app.close();await start();
  assert.equal((await send(end)).duplicate,true);
  await call(kp+'/'+key.id,{method:'DELETE',cookie:b.cookie,status:403});
  await call(wp+'/workflows/'+other.id+'/keys/'+key.id,{method:'DELETE',cookie:a.cookie,status:404});
  await call(kp+'/'+key.id,{method:'DELETE',cookie:a.cookie,status:204});
  await call(kp+'/'+key.id,{method:'DELETE',cookie:a.cookie,status:204});
  await send({...startEvent,runId:'revoked'},401);
  const replacement=(await call(kp,{method:'POST',cookie:a.cookie,status:201,body:{label:'Replacement'}})).data;
  await call(ep,{method:'POST',body:{...startEvent,runId:'rotation'},machine:true,key:replacement.key});
  await db.workflowApiKey.update({where:{id:replacement.id},data:{expiresAt:new Date(0)}});
  await call(ep,{method:'POST',body:{...startEvent,runId:'expired'},machine:true,key:replacement.key,status:401});
  console.log(JSON.stringify({httpAssertions:checks,idempotency:'passed',concurrentDelivery:'passed',outOfOrder:'passed',rollback:'passed',keyIsolation:'passed',revocation:'passed',expiry:'passed',restart:'passed'}));
} finally {
  if(db) await db.$transaction(async tx=>{
    await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:spaces}}}}});
    await tx.run.deleteMany({where:{workflow:{workspaceId:{in:spaces}}}});
    await tx.workflow.deleteMany({where:{workspaceId:{in:spaces}}});
    await tx.workspace.deleteMany({where:{id:{in:spaces}}});
    await tx.user.deleteMany({where:{id:{in:users}}});
  });
  if(app) await app.close();
}
