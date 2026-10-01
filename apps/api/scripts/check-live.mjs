import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
if(existsSync('.env'))process.loadEnvFile('.env');
if(process.env.NODE_ENV==='production')throw new Error('Local tests only.');
const suffix=randomBytes(8).toString('hex'),users=[],spaces=[],streams=[];
const configFile='../../.data/live-test-'+suffix+'.json';
let app,db,base,server,hits=0,checks=0,mode='ok',machineKey,workflowId;
async function call(path,{cookie,body,method=body?'POST':'GET',status=200,key,headers={}}={}){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:process.env.FRONTEND_URL??'http://localhost:3000','X-Requested-With':'AutomationMonitor',...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,status,method+' '+path);checks++;
 return {data:r.status===204?null:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function stream(path,cookie,headers={}){
 const controller=new AbortController();streams.push(controller);
 const r=await fetch(base+path,{headers:{Cookie:cookie,...headers},signal:controller.signal});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);
 const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
 return {close:()=>controller.abort(),next:async(type)=>{const timeout=setTimeout(()=>controller.abort(),10000);try{while(true){const split=buffer.indexOf('\n\n');if(split>=0){const block=buffer.slice(0,split);buffer=buffer.slice(split+2);if(block.includes('event: '+type))return block;continue;}const {value,done}=await reader.read();if(done)throw new Error('Stream closed before '+type);buffer+=decoder.decode(value,{stream:true}).replaceAll('\r\n','\n');}}finally{clearTimeout(timeout);}}};
}
try{
 app=await NestFactory.create(AppModule,{logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();db=app.get(PrismaService).client;
 async function account(label){const r=await call('/auth/register',{status:201,body:{name:label,email:label+'-'+suffix+'@example.test',password:randomBytes(20).toString('hex'),workspaceName:'Live test'}});users.push(r.data.id);const workspace=(await call('/workspaces',{cookie:r.cookie})).data[0].workspaceId;spaces.push(workspace);return {...r,workspace};}
 const a=await account('live-owner'),b=await account('live-other');
 const workflow=await db.workflow.create({data:{workspaceId:a.workspace,name:'Replay sample',slug:'replay'}});workflowId=workflow.id;
 const path='/workspaces/'+a.workspace;
 await call(path+'/live',{status:401});await call(path+'/live',{cookie:b.cookie,status:404});
 const live=await stream(path+'/live',a.cookie);const initial=await live.next('refresh');
 const before=await db.workspaceRevision.findUniqueOrThrow({where:{workspaceId:a.workspace}});
 const raw=(await call(path+'/workflows/'+workflow.id+'/keys',{cookie:a.cookie,status:201,body:{label:'Live test'}})).data;machineKey=raw.key;
 const input={orderId:'demo',amount:-1},stamp=new Date().toISOString();
 const endpoint='/ingest/workflows/'+workflow.id+'/events';
 const started={runId:'n8n:100',eventId:'start',type:'STARTED',occurredAt:stamp,replayInput:input};
 const source=(await call(endpoint,{key:machineKey,body:started})).data.run;
 await call(endpoint,{key:machineKey,body:started});
 await call(endpoint,{key:machineKey,body:{...started,replayInput:{...input,amount:-2}},status:409});
 await call(endpoint,{key:machineKey,body:{...started,type:'FAILED'},status:400});
 await call(endpoint,{key:machineKey,body:{runId:'n8n:100',eventId:'failed',type:'FAILED',occurredAt:stamp}});
 const update=await live.next('refresh');assert.notEqual(update,initial);
 const after=await db.workspaceRevision.findUniqueOrThrow({where:{workspaceId:a.workspace}});assert.ok(after.revision>before.revision);
 const revisionBeforeRollback=after.revision;
 await assert.rejects(db.$transaction(async tx=>{await tx.workflow.update({where:{id:workflow.id},data:{name:'Rolled back'}});throw new Error('rollback');}));
 assert.equal((await db.workspaceRevision.findUniqueOrThrow({where:{workspaceId:a.workspace}})).revision,revisionBeforeRollback);
 live.close();
 const resumed=await stream(path+'/live',a.cookie,{'Last-Event-ID':String(after.revision)});assert.match(await resumed.next('refresh'),new RegExp('id: '+after.revision));resumed.close();
 server=createServer(async(req,res)=>{hits++;if(mode==='reject'){res.writeHead(403);res.end();return;}if(mode==='drop'){req.socket.destroy();return;}try{let body='';for await(const chunk of req)body+=chunk;const payload=JSON.parse(body);assert.equal(req.url,'/webhook/automation-monitor/orders');assert.equal(req.headers['x-order-key'],'x'.repeat(43));const external='n8n:'+randomBytes(4).readUInt32BE(0);const at=new Date().toISOString();await call(endpoint,{key:machineKey,body:{runId:external,eventId:'start',type:'STARTED',occurredAt:at,replayInput:{orderId:payload.orderId,amount:payload.amount},rerunRequestId:payload.rerunRequestId}});await call(endpoint,{key:machineKey,body:{runId:external,eventId:'failed',type:'FAILED',occurredAt:at}});res.writeHead(500);res.end('Deliberate invalid order');}catch{res.writeHead(500);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 process.env.N8N_WEBHOOK_ORIGIN='http://127.0.0.1:'+server.address().port;
 mkdirSync('../../.data',{recursive:true});writeFileSync(configFile,JSON.stringify({workflowId,webhookKey:'x'.repeat(43),replayVersion:1}));process.env.N8N_CONNECTION_FILE=configFile;
 const rerun=path+'/runs/'+source.id+'/rerun';
 assert.equal((await call(rerun,{cookie:a.cookie})).data.eligible,true);
 await call(rerun,{cookie:b.cookie,status:404});
 await call(path+'/members',{cookie:a.cookie,status:201,body:{email:b.data.email}});
 await call(rerun,{cookie:b.cookie,body:{requestId:randomUUID()},status:403});
 await call(rerun,{cookie:a.cookie,body:{requestId:randomUUID(),url:'http://example.com'},status:400});
 await call(rerun,{cookie:a.cookie,body:{requestId:randomUUID()},headers:{Origin:'http://evil.test'},status:403});
 const requestId=randomUUID();const requests=await Promise.all([call(rerun,{cookie:a.cookie,body:{requestId}}),call(rerun,{cookie:a.cookie,body:{requestId}})]);assert.equal(hits,1);
 const audit=(await call(rerun,{cookie:a.cookie})).data.audit;assert.equal(audit.status,'OBSERVED');assert.equal(audit.result.status,'FAILED');assert.notEqual(audit.result.id,source.id);assert.equal(audit.requestedById,a.data.id);
 await call(rerun,{cookie:a.cookie,body:{requestId:randomUUID()}});assert.equal(hits,1);assert.equal(requests[0].data.audit.id,requestId);
 const second=await db.run.create({data:{workflowId,externalId:'n8n:200',status:'FAILED',replayInput:input}});
 await call(path+'/runs/'+second.id+'/rerun',{cookie:a.cookie,body:{requestId},status:409});
 mode='drop';const uncertain=(await call(path+'/runs/'+second.id+'/rerun',{cookie:a.cookie,body:{requestId:randomUUID()}})).data;assert.equal(uncertain.audit.status,'UNCERTAIN');await call(endpoint,{key:machineKey,body:{runId:second.externalId,eventId:'self-link',type:'STARTED',occurredAt:new Date().toISOString(),replayInput:input,rerunRequestId:uncertain.audit.id},status:409});const previousHits=hits;await call(path+'/runs/'+second.id+'/rerun',{cookie:a.cookie,body:{requestId:randomUUID()}});assert.equal(hits,previousHits);
 const third=await db.run.create({data:{workflowId,externalId:'n8n:300',status:'FAILED',replayInput:input}});mode='reject';assert.equal((await call(path+'/runs/'+third.id+'/rerun',{cookie:a.cookie,body:{requestId:randomUUID()}})).data.audit.status,'REJECTED');
 const old=await db.run.create({data:{workflowId,externalId:'legacy',status:'FAILED'}});assert.equal((await call(path+'/runs/'+old.id+'/rerun',{cookie:a.cookie})).data.eligible,false);
 const memberStream=await stream(path+'/live',b.cookie);await memberStream.next('refresh');await call(path+'/members/'+b.data.id,{cookie:a.cookie,method:'DELETE',status:204});await memberStream.next('access-ended');memberStream.close();
 const ownerStream=await stream(path+'/live',a.cookie);await ownerStream.next('refresh');await call('/auth/logout',{cookie:a.cookie,method:'POST',status:204});await ownerStream.next('access-ended');ownerStream.close();
 console.log(JSON.stringify({httpAssertions:checks,liveUpdates:'passed',reconnectSnapshot:'passed',revisionRollback:'passed',sessionRevocation:'passed',membershipRevocation:'passed',rerunIdempotency:'passed',outcomeCorrelation:'passed',uncertainDelivery:'passed',ownerAuthorization:'passed'}));
}finally{
 for(const controller of streams)controller.abort();
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(db)await db.$transaction(async tx=>{await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:spaces}}}}});await tx.run.deleteMany({where:{workflow:{workspaceId:{in:spaces}}}});await tx.workflow.deleteMany({where:{workspaceId:{in:spaces}}});await tx.workspace.deleteMany({where:{id:{in:spaces}}});await tx.user.deleteMany({where:{id:{in:users}}});});
 if(app)await app.close();if(existsSync(configFile))rmSync(configFile);
}
