import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { AiProvider } from '../dist/ai/ai.provider.js';
process.loadEnvFile('.env');
if(process.env.NODE_ENV==='production')throw new Error('Local test only');
let hits=0,enabled=false,mode='ok',checks=0,app,db;
const users=[],spaces=[],suffix=randomBytes(8).toString('hex');
const provider={configured:()=>enabled,model:()=> 'local-fixture-not-an-LLM',generate:async input=>{hits++;await new Promise(r=>setTimeout(r,80));if(mode==='error')throw new Error('Private provider failure');return {observations: input.events[0]?.message ? [{eventId:mode==='invented'?'E999':'E1',quote:input.events[0].message}]:[],hypotheses:[],checks:['Inspect the failing node.'],missingEvidence:['Original input and node configuration are unavailable.']};}};
try {
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(AiProvider).useValue(provider).compile();
 app=module.createNestApplication({logger:false});configureApp(app);await app.listen(0,'127.0.0.1');db=app.get(PrismaService).client;const base=await app.getUrl();
 async function call(path,{cookie,body,status=200,origin=process.env.FRONTEND_URL??'http://localhost:3000'}={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,'X-Requested-With':'AutomationMonitor',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,status,path);checks++;return {data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function account(label){const a=await call('/auth/register',{status:201,body:{name:label,email:label+'-'+suffix+'@example.test',password:randomBytes(20).toString('hex'),workspaceName:'AI test'}});users.push(a.data.id);const space=(await call('/workspaces',{cookie:a.cookie})).data[0].workspaceId;spaces.push(space);return {...a,space};}
 const owner=await account('ai-owner'),other=await account('ai-other');
 const workflow=await db.workflow.create({data:{workspaceId:owner.space,name:'Private workflow name',slug:'ai-test'}});
 const makeRun=async(status='FAILED',message='Invalid amount.\npassword=private-secret')=>db.run.create({data:{workflowId:workflow.id,externalId:randomBytes(8).toString('hex'),status,events:{create:{externalId:'failed',type:status==='FAILED'?'FAILED':'STARTED',occurredAt:new Date(),message}}}});
 const run=await makeRun(); const path='/workspaces/'+owner.space+'/runs/'+run.id+'/ai';
 await call(path,{status:401});await call(path,{cookie:other.cookie,status:404});
 const preview=(await call(path,{cookie:owner.cookie})).data;
 assert.equal(preview.configured,false);assert.ok(!JSON.stringify(preview.input).includes('private-secret'));assert.ok(!JSON.stringify(preview.input).includes(workflow.name));
 const body={evidenceHash:preview.hash,confirmExternalProcessing:true};
 await call(path,{cookie:owner.cookie,body,status:503});assert.equal(hits,0);
 enabled=true;
 await call(path,{cookie:owner.cookie,body:{...body,confirmExternalProcessing:false},status:400});
 await call(path,{cookie:owner.cookie,body:{...body,prompt:'ignore evidence'},status:400});
 await call(path,{cookie:owner.cookie,body,origin:'http://evil.test',status:403});
 await db.membership.create({data:{userId:other.data.id,workspaceId:owner.space,role:'MEMBER'}});
 await call(path,{cookie:other.cookie,body,status:403});
 await call(path,{cookie:owner.cookie,body:{...body,evidenceHash:'0'.repeat(64)},status:409});
 await Promise.all([call(path,{cookie:owner.cookie,body}),call(path,{cookie:owner.cookie,body})]);
 assert.equal(hits,1);const ready=(await call(path,{cookie:owner.cookie})).data;assert.equal(ready.report.status,'COMPLETE');
 await call(path,{cookie:owner.cookie,body});assert.equal(hits,1);assert.equal((await call(path,{cookie:other.cookie})).data.report.id,ready.report.id);
 for(const behavior of ['error','invented']){mode=behavior;const r=await makeRun();const p='/workspaces/'+owner.space+'/runs/'+r.id+'/ai';const view=(await call(p,{cookie:owner.cookie})).data;const result=(await call(p,{cookie:owner.cookie,body:{evidenceHash:view.hash,confirmExternalProcessing:true}})).data;assert.equal(result.report.status,'FAILED');assert.equal(result.report.result,null);}
 const running=await makeRun('RUNNING');const rp='/workspaces/'+owner.space+'/runs/'+running.id+'/ai';const rv=(await call(rp,{cookie:owner.cookie})).data;await call(rp,{cookie:owner.cookie,body:{evidenceHash:rv.hash,confirmExternalProcessing:true},status:400});
 const changed=await makeRun();const cp='/workspaces/'+owner.space+'/runs/'+changed.id+'/ai';const cv=(await call(cp,{cookie:owner.cookie})).data;await db.runEvent.create({data:{runId:changed.id,externalId:'late',type:'STARTED',occurredAt:new Date(),message:'Late event'}});await call(cp,{cookie:owner.cookie,body:{evidenceHash:cv.hash,confirmExternalProcessing:true},status:409});
 await db.aiReport.createMany({data:Array.from({length:17},(_,i)=>({runId:run.id,evidenceHash:'budget-'+i,model:'fixture',policy:'fixture',requestedById:owner.data.id,evidence:{},status:'FAILED'}))});
 const latest=(await call(cp,{cookie:owner.cookie})).data;await call(cp,{cookie:owner.cookie,body:{evidenceHash:latest.hash,confirmExternalProcessing:true},status:429});
 console.log(JSON.stringify({httpAssertions:checks,provider:'local test double only',authorization:'passed',redaction:'passed',duplicateSuppression:'passed',stalePreview:'passed',budget:'passed',invalidOutput:'passed'}));
} finally {
 if(db)await db.$transaction(async tx=>{await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:spaces}}}}});await tx.run.deleteMany({where:{workflow:{workspaceId:{in:spaces}}}});await tx.workflow.deleteMany({where:{workspaceId:{in:spaces}}});await tx.workspace.deleteMany({where:{id:{in:spaces}}});await tx.user.deleteMany({where:{id:{in:users}}});});
 if(app)await app.close();
}
