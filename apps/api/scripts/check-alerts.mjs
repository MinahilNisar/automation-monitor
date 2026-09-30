import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { AlertsEngine, redisConnection } from '../dist/alerts/alerts.engine.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Local integration test only.');
const suffix=randomBytes(8).toString('hex'),users=[],spaces=[];
let app,db,base,engine,worker,checks=0;
async function call(path,{method='GET',body,cookie,key,status=200}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:process.env.FRONTEND_URL??'http://localhost:3000','X-Requested-With':'AutomationMonitor',...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,method+' '+path);checks++;
  return {data:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function until(read,accept) {const end=Date.now()+20000;while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for alert delivery.');}
try {
  const liveQueue=new Queue('automation-alerts',{connection:redisConnection()});
  liveQueue.on('error',()=>{});
  try { assert.equal((await liveQueue.getWorkers()).length,0,'Stop the normal alert worker before testing: npm run alerts:stop'); } finally { await liveQueue.close(); }
  app=await NestFactory.create(AppModule,{logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();db=app.get(PrismaService).client;
  async function account(label) {const r=await call('/auth/register',{method:'POST',status:201,body:{name:label,email:label+'-'+suffix+'@example.test',password:randomBytes(24).toString('hex'),workspaceName:'Alert tests'}});users.push(r.data.id);const workspace=(await call('/workspaces',{cookie:r.cookie})).data[0].workspaceId;spaces.push(workspace);return {...r,workspace};}
  const owner=await account('alert-owner'),other=await account('alert-other');
  const workflow=await db.workflow.create({data:{workspaceId:owner.workspace,slug:'alerts',name:'Alert test'}});
  const disabled=await db.workflow.create({data:{workspaceId:owner.workspace,slug:'disabled',name:'Disabled rule'}});
  const path='/workspaces/'+owner.workspace,policy=path+'/workflows/'+workflow.id+'/alert-policy';
  await call(path+'/alerts',{status:401});await call(path+'/alerts',{cookie:other.cookie,status:404});
  assert.deepEqual((await call(policy,{cookie:owner.cookie})).data,{workflowId:workflow.id,failureEnabled:false,expectedMinutes:null});
  await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:true,expectedMinutes:0},status:400});
  await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:true,expectedMinutes:1,extra:1},status:400});
  await call('/workspaces/'+other.workspace+'/workflows/'+workflow.id+'/alert-policy',{cookie:other.cookie,status:404});
  await call(path+'/members',{method:'POST',cookie:owner.cookie,status:201,body:{email:other.data.email}});
  await call(policy,{cookie:other.cookie});
  await call(policy,{method:'PUT',cookie:other.cookie,body:{failureEnabled:true,expectedMinutes:1},status:403});
  const saved=(await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:true,expectedMinutes:1}})).data;
  const same=(await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:true,expectedMinutes:1}})).data;
  assert.equal(same.generation,saved.generation);assert.equal(same.monitoringSince,saved.monitoringSince);
  const key=(await call(path+'/workflows/'+workflow.id+'/keys',{method:'POST',cookie:owner.cookie,status:201,body:{label:'Alert tests'}})).data.key;
  const event={runId:'failed-1',eventId:'failure',type:'FAILED',occurredAt:new Date().toISOString(),message:'Test failure'};
  const endpoint='/ingest/workflows/'+workflow.id+'/events';
  const first=(await call(endpoint,{method:'POST',key,body:event,status:200})).data;
  await call(endpoint,{method:'POST',key,body:event});
  await call(endpoint,{method:'POST',key,body:{...event,eventId:'second-report'},status:200});
  const where={workflowId:workflow.id};
  assert.equal(await db.alert.count({where}),1);
  const failure=await db.alert.findFirstOrThrow({where});assert.equal(failure.delivery,'PENDING');assert.equal(failure.runId,first.run.id);
  // No Redis interaction has occurred: failure and outbox were committed atomically.
  const beforeMissing=new Date();await db.alertPolicy.update({where:{workflowId:workflow.id},data:{monitoringSince:new Date(beforeMissing.getTime()-120000)}});
  await db.run.update({where:{id:first.run.id},data:{createdAt:new Date(beforeMissing.getTime()-120000)}});
  engine=new AlertsEngine(db,'alerts-test-'+suffix,[workflow.id,disabled.id]);
  await engine.queue.waitUntilReady();
  await Promise.all([engine.scanMissing(beforeMissing),engine.scanMissing(beforeMissing)]);
  assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),1);
  await engine.scanMissing(new Date(beforeMissing.getTime()+100000));assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),1);
  await call(endpoint,{method:'POST',key,body:{runId:'next-run',eventId:'start',type:'STARTED',occurredAt:new Date().toISOString()},status:200});
  await engine.scanMissing(new Date());assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),1);
  await engine.scanMissing(new Date(Date.now()+61000));assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),2);
  await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:false,expectedMinutes:null}});
  await engine.scanMissing(new Date(Date.now()+86400000));assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),2);
  await call(endpoint,{method:'POST',key,body:{...event,runId:'disabled-failure',occurredAt:new Date().toISOString()},status:200});assert.equal(await db.alert.count({where:{...where,kind:'FAILURE'}}),1);
  let attempts=0;
  worker=engine.createWorker(async(id,attempt)=>{if(id===failure.id&&++attempts<3)throw new Error('Simulated temporary delivery failure');await engine.deliver(id,attempt);});
  await engine.dispatch();
  const delivered=await until(()=>db.alert.findUnique({where:{id:failure.id}}),row=>row?.delivery==='DELIVERED');assert.equal(delivered.attempts,3);assert.equal(attempts,3);
  await until(()=>db.alert.count({where:{...where,delivery:'PENDING'}}),n=>n===0);
  const inbox=(await call(path+'/alerts',{cookie:owner.cookie})).data;assert.equal(inbox.total,3);assert.equal(inbox.unread,3);
  await call(path+'/alerts/'+failure.id+'/read',{method:'PATCH',cookie:other.cookie});
  const readAt=(await db.alert.findUniqueOrThrow({where:{id:failure.id}})).readAt;
  await engine.deliver(failure.id,99);await engine.dispatch();
  const reread=await db.alert.findUniqueOrThrow({where:{id:failure.id}});assert.equal(reread.attempts,3);assert.equal(+reread.readAt,+readAt);
  await call(path+'/alerts?page=0',{cookie:owner.cookie,status:400});
  await call('/workspaces/'+other.workspace+'/alerts/'+failure.id+'/read',{method:'PATCH',cookie:other.cookie,status:404});
  await worker.close();worker=undefined;
  const exhausted=await db.alert.create({data:{workflowId:workflow.id,kind:'FAILURE',dedupeKey:'test:'+suffix,message:'Simulated permanent delivery failure'}});
  worker=engine.createWorker(async()=>{throw new Error('Simulated permanent delivery failure');});
  await engine.dispatch();
  const failed=await until(()=>db.alert.findUnique({where:{id:exhausted.id}}),row=>row?.delivery==='FAILED');assert.equal(failed.attempts,3);
  await engine.dispatch();assert.equal((await engine.queue.getJob(exhausted.id)).attemptsMade,3);
  await call(path+'/members/'+other.data.id,{method:'DELETE',cookie:owner.cookie,status:204});await call(path+'/alerts',{cookie:other.cookie,status:404});
  await db.alert.createMany({data:Array.from({length:21},(_,i)=>({workflowId:workflow.id,kind:'FAILURE',dedupeKey:'page:'+suffix+':'+i,message:'Pagination test'}))});
  const page1=(await call(path+'/alerts',{cookie:owner.cookie})).data,page2=(await call(path+'/alerts?page=2',{cookie:owner.cookie})).data;
  assert.equal(page1.items.length,20);assert.equal(page2.items.length,5);assert.equal(new Set([...page1.items,...page2.items].map(a=>a.id)).size,25);
  // A changed interval resets observation rather than alerting on historical gaps.
  const changed=(await call(policy,{method:'PUT',cookie:owner.cookie,body:{failureEnabled:true,expectedMinutes:2}})).data;assert.notEqual(changed.generation,saved.generation);
  await engine.scanMissing(new Date());assert.equal(await db.alert.count({where:{...where,kind:'MISSING_RUN'}}),2);
  console.log(JSON.stringify({httpAssertions:checks,atomicOutbox:'passed',failureDeduplication:'passed',missingRunEpisodes:'passed',concurrentScans:'passed',boundedRetries:'passed',idempotentDelivery:'passed',workspaceIsolation:'passed',ownerRules:'passed',pagination:'passed'}));
} finally {
  if(worker)await worker.close();
  if(engine){try{await engine.queue.obliterate({force:true});}catch{console.error('Temporary queue cleanup failed: '+engine.queueName);}finally{await engine.close();}}
  if(db)await db.$transaction(async tx=>{await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:spaces}}}}});await tx.run.deleteMany({where:{workflow:{workspaceId:{in:spaces}}}});await tx.workflow.deleteMany({where:{workspaceId:{in:spaces}}});await tx.workspace.deleteMany({where:{id:{in:spaces}}});await tx.user.deleteMany({where:{id:{in:users}}});});
  if(app)await app.close();
}
