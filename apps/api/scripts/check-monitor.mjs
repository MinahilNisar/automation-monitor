import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Local development tests only.');
const suffix=randomBytes(8).toString('hex'),users=[],spaces=[];
let app,db,base,checks=0;
async function call(path,{method='GET',body,cookie,status=200}={}) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:process.env.FRONTEND_URL??'http://localhost:3000','X-Requested-With':'AutomationMonitor',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,status,method+' '+path);checks++;
  return {data:response.status===204?null:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try {
  app=await NestFactory.create(AppModule,{logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();db=app.get(PrismaService).client;
  async function register(label) {
    const result=await call('/auth/register',{method:'POST',status:201,body:{name:label,email:label+'-'+suffix+'@example.test',password:randomBytes(24).toString('hex'),workspaceName:'Monitor test'}});
    users.push(result.data.id);const workspace=(await call('/workspaces',{cookie:result.cookie})).data[0].workspaceId;spaces.push(workspace);return {...result,workspace};
  }
  const a=await register('monitor-owner'),b=await register('monitor-other');
  const wf=await db.workflow.create({data:{workspaceId:a.workspace,name:'Report',slug:'report'}});
  const other=await db.workflow.create({data:{workspaceId:b.workspace,name:'Private',slug:'private'}});
  const path='/workspaces/'+a.workspace+'/monitor';
  const range='?from=2026-09-01&to=2026-09-03';
  const read=(query=range,status=200,cookie=a.cookie)=>call(path+query,{cookie,status}).then(r=>r.data);
  await call(path+range,{status:401});
  const empty=await read();assert.equal(empty.summary.total,0);assert.equal(empty.summary.successRate,null);assert.equal(empty.daily.length,3);assert.equal(empty.daily[1].FAILED,0);
  const ids=[];
  // 25 executions share receivedAt, exercising the deterministic secondary ID sort.
  for(let i=0;i<25;i++) {
    const id=randomUUID();ids.push(id);
    const status=i<15?'SUCCEEDED':i<20?'FAILED':'RUNNING';
    await db.run.create({data:{id,workflowId:wf.id,externalId:'run-'+i,status,createdAt:new Date('2026-09-01T00:00:00.000Z'),startedAt:i===0?null:new Date('2026-08-31T23:59:00Z'),finishedAt:status==='RUNNING'?null:new Date('2026-09-01T00:01:00Z')}});
  }
  await db.run.create({data:{workflowId:wf.id,externalId:'last-millisecond',status:'SUCCEEDED',createdAt:new Date('2026-09-03T23:59:59.999Z')}});
  await db.run.create({data:{workflowId:wf.id,externalId:'outside',status:'FAILED',createdAt:new Date('2026-09-04T00:00:00Z')}});
  await db.run.create({data:{workflowId:other.id,externalId:'private',status:'FAILED',createdAt:new Date('2026-09-01T00:00:00Z')}});
  await db.runEvent.createMany({data:Array.from({length:55},(_,i)=>({runId:ids[0],externalId:'event-'+i,type:'COMPLETED',message:i===0?'<script>alert("not executable")</script>':'Event '+i,occurredAt:new Date(Date.UTC(2026,8,1,0,0,i))}))});
  const first=await read();assert.deepEqual(first.summary,{total:26,running:5,succeeded:16,failed:5,successRate:76.2});assert.equal(first.items.length,20);assert.equal(first.totalPages,2);
  assert.equal(first.items[0].externalId,'last-millisecond');assert.equal(first.daily[0].SUCCEEDED,15);assert.equal(first.daily[1].SUCCEEDED,0);assert.equal(first.daily[2].SUCCEEDED,1);
  const second=await read(range+'&page=2');assert.equal(second.items.length,6);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,26);assert.deepEqual(second.summary,first.summary);
  const failed=await read(range+'&status=FAILED');assert.equal(failed.summary.total,5);assert.equal(failed.summary.successRate,0);assert.ok(failed.items.every(r=>r.status==='FAILED'));
  const running=await read(range+'&status=RUNNING');assert.equal(running.summary.successRate,null);
  assert.equal((await read(range+'&workflowId='+wf.id)).summary.total,26);
  await read(range+'&workflowId='+other.id,404);
  await read(range,404,b.cookie);
  await read(range+'&status=bad',400);await read(range+'&page=0',400);await read('?from=2026-09-03&to=2026-09-01',400);await read('?from=2026-02-30&to=2026-03-01',400);await read('?from=2026-01-01&to=2026-09-01',400);await read(range+'&extra=1',400);
  assert.equal((await read(range+'&page=3')).items.length,0);
  const detail=(await call(path+'/runs/'+ids[0],{cookie:a.cookie})).data;
  assert.equal(detail.run.startedAt,null);assert.equal(detail.totalEvents,55);assert.equal(detail.events.length,50);assert.equal(detail.events[0].externalId,'event-0');assert.equal(detail.events[0].message,'<script>alert("not executable")</script>');
  const tail=(await call(path+'/runs/'+ids[0]+'?page=2',{cookie:a.cookie})).data;assert.equal(tail.events.length,5);assert.equal(tail.events[0].externalId,'event-50');
  await call('/workspaces/'+b.workspace+'/monitor/runs/'+ids[0],{cookie:b.cookie,status:404});
  await call(path+'/runs/'+randomUUID(),{cookie:a.cookie,status:404});
  await call(path+'/runs/'+ids[0]+'?page=0',{cookie:a.cookie,status:400});
  await db.workflow.createMany({data:Array.from({length:101},(_,i)=>({workspaceId:a.workspace,name:'Option '+i,slug:'option-'+i}))});
  const options=(await call(path+'/workflows',{cookie:a.cookie})).data;assert.equal(options.items.length,100);assert.ok(options.nextCursor);
  const next=(await call(path+'/workflows?cursor='+options.nextCursor,{cookie:a.cookie})).data;assert.equal(next.items.length,2);assert.equal(next.nextCursor,null);assert.equal(new Set([...options.items,...next.items].map(w=>w.id)).size,102);
  await call(path+'/workflows',{cookie:b.cookie,status:404});
  await call('/workspaces/'+a.workspace+'/members',{method:'POST',cookie:a.cookie,status:201,body:{email:b.data.email}});
  assert.equal((await read(range,200,b.cookie)).summary.total,26);
  await call('/workspaces/'+a.workspace+'/members/'+b.data.id,{method:'DELETE',cookie:a.cookie,status:204});
  await read(range,404,b.cookie);
  console.log(JSON.stringify({httpAssertions:checks,aggregates:'passed',pagination:'passed',utcBoundaries:'passed',workspaceIsolation:'passed',membershipRevocation:'passed',eventPagination:'passed',workflowPagination:'passed'}));
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
