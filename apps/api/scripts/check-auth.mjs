import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Test accounts are for local development only.');
const origin=process.env.FRONTEND_URL ?? 'http://localhost:3000';
const password='Test-' + randomBytes(20).toString('hex');
const suffix=randomBytes(8).toString('hex');
const users=[]; const workspaces=[]; let checks=0;
let app; let db; let base;
async function start() { app=await NestFactory.create(AppModule,{logger:false});configureApp(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();db=app.get(PrismaService).client; }
async function call(url,{method='GET',body,cookie,expected=200,requestOrigin=origin,header=true}={}) {
  const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(requestOrigin ? {Origin:requestOrigin}:{}),...(header?{'X-Requested-With':'AutomationMonitor'}:{}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(response.status,expected,method+' '+url+' unexpected status');checks++;
  const text=await response.text(); return {response,data:text?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try {
  await start();
  await call('/dev/workflows',{expected:404});
  await call('/workspaces',{expected:401});
  await call('/auth/register',{method:'POST',body:{},requestOrigin:'https://untrusted.example',expected:403});
  await call('/auth/register',{method:'POST',body:{},requestOrigin:null,expected:403});
  await call('/auth/register',{method:'POST',body:{},header:false,expected:403});
  await call('/auth/register',{method:'POST',body:{email:'bad'},expected:400});
  async function register(label) {
    const result=await call('/auth/register',{method:'POST',expected:201,body:{name:'Test '+label,email:label+'-'+suffix+'@example.test',password,workspaceName:'Test '+label}});
    users.push(result.data.id);
    assert.ok(!('passwordHash' in result.data));
    assert.match(result.response.headers.get('set-cookie'),/HttpOnly/i);
    assert.match(result.response.headers.get('set-cookie'),/SameSite=Lax/i);
    const spaces=(await call('/workspaces',{cookie:result.cookie})).data;
    assert.equal(spaces.length,1);assert.equal(spaces[0].role,'OWNER');
    const id=spaces[0].workspaceId; workspaces.push(id);
    const stored=await db.user.findUniqueOrThrow({where:{id:result.data.id}});
    assert.notEqual(stored.passwordHash,password);assert.match(stored.passwordHash,/^scrypt-v1:/);
    const raw=result.cookie.split('=')[1];
    const session=await db.session.findUniqueOrThrow({where:{tokenHash:createHash('sha256').update(raw).digest('hex')}});
    assert.notEqual(session.tokenHash,raw);
    return {...result,workspace:id};
  }
  const a=await register('owner-a'); const b=await register('owner-b');
  const aPath='/workspaces/'+a.workspace;const bPath='/workspaces/'+b.workspace;
  const wa=(await call(aPath+'/workflows',{method:'POST',cookie:a.cookie,expected:201,body:{name:'Private A',slug:'same-slug'}})).data;
  await call(bPath+'/workflows',{method:'POST',cookie:b.cookie,expected:201,body:{name:'Private B',slug:'same-slug'}});
  await call(aPath+'/workflows',{method:'POST',cookie:a.cookie,expected:409,body:{name:'Duplicate',slug:'same-slug'}});
  await call(aPath+'/workflows',{cookie:b.cookie,expected:404});
  await call(aPath+'/workflows',{method:'POST',cookie:b.cookie,expected:404,body:{name:'Intrusion',slug:'intrusion'}});
  await call(aPath+'/members',{cookie:b.cookie,expected:404});
  await call(bPath+'/workflows/'+wa.id+'/runs',{cookie:b.cookie,expected:404});
  await db.run.create({data:{workflowId:wa.id,externalId:'auth-test-run',status:'SUCCEEDED',startedAt:new Date(),events:{create:{externalId:'auth-test-event',type:'COMPLETED',message:'Private event',occurredAt:new Date()}}}});
  assert.equal((await call(aPath+'/workflows/'+wa.id+'/runs',{cookie:a.cookie})).data[0].events[0].message,'Private event');
  await call(aPath+'/workflows/'+wa.id+'/runs',{cookie:b.cookie,expected:404});
  await call(aPath+'/members',{method:'POST',cookie:a.cookie,expected:201,body:{email:b.data.email}});
  assert.equal((await call('/workspaces',{cookie:b.cookie})).data.length,2);
  await call(aPath+'/workflows',{cookie:b.cookie});
  await call(aPath+'/members',{method:'POST',cookie:b.cookie,expected:403,body:{email:a.data.email}});
  await call(aPath+'/members/'+a.data.id,{method:'DELETE',cookie:a.cookie,expected:404});
  await call(aPath+'/members/'+b.data.id,{method:'DELETE',cookie:a.cookie,expected:204});
  await call(aPath+'/workflows',{cookie:b.cookie,expected:404});
  await call(aPath+'/workflows',{method:'POST',cookie:b.cookie,expected:404,body:{name:'After removal',slug:'removed'}});
  await call('/auth/login',{method:'POST',body:{email:a.data.email,password:'wrong-password-value'},expected:401});
  await call('/auth/login',{method:'POST',body:{email:'missing-'+suffix+'@example.test',password},expected:401});
  const login=await call('/auth/login',{method:'POST',cookie:a.cookie,body:{email:a.data.email.toUpperCase(),password}});
  await call('/auth/me',{cookie:a.cookie,expected:401});
  await call('/auth/me',{cookie:login.cookie});
  await app.close(); await start();
  assert.equal((await call('/auth/me',{cookie:login.cookie})).data.id,a.data.id);
  const raw=login.cookie.split('=')[1];
  await db.session.update({where:{tokenHash:createHash('sha256').update(raw).digest('hex')},data:{expiresAt:new Date(0)}});
  await call('/auth/me',{cookie:login.cookie,expected:401});
  const fresh=await call('/auth/login',{method:'POST',body:{email:a.data.email,password}});
  await call('/auth/logout',{method:'POST',cookie:fresh.cookie,expected:204});
  await call('/auth/me',{cookie:fresh.cookie,expected:401});
  await call('/auth/me',{cookie:'am_session='+randomBytes(32).toString('base64url'),expected:401});
  await call('/auth/me',{cookie:'am_session=j%3A%7B%7D',expected:401});
  // Ten login attempts per minute per process/IP/route; the valid login above used one.
  for(let i=0;i<9;i++) await call('/auth/login',{method:'POST',body:{email:a.data.email,password:'wrong-password-value'},expected:401});
  await call('/auth/login',{method:'POST',body:{email:a.data.email,password:'wrong-password-value'},expected:429});
  console.log(JSON.stringify({httpAssertions:checks,workspaceIsolation:'passed',membershipRevocation:'passed',sessionRotation:'passed',sessionExpiry:'passed',logoutRevocation:'passed',apiRestart:'passed',csrf:'passed',rateLimiting:'passed'}));
} finally {
  if(db) {
    await db.$transaction(async tx=>{
      await tx.runEvent.deleteMany({where:{run:{workflow:{workspaceId:{in:workspaces}}}}});
      await tx.run.deleteMany({where:{workflow:{workspaceId:{in:workspaces}}}});
      await tx.workflow.deleteMany({where:{workspaceId:{in:workspaces}}});
      await tx.workspace.deleteMany({where:{id:{in:workspaces}}});
      await tx.user.deleteMany({where:{id:{in:users}}});
    });
  }
  if(app) await app.close();
}
