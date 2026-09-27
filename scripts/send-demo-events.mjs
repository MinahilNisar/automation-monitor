import { randomUUID } from 'node:crypto';
const key=process.env.INGEST_API_KEY;
const workflowId=process.env.WORKFLOW_ID;
const base=process.env.API_URL ?? 'http://localhost:3001';
if(!key || !workflowId) throw new Error('Set INGEST_API_KEY and WORKFLOW_ID in your terminal first.');
const runId='demo-'+randomUUID();
const startedAt=new Date(Date.now()-1000).toISOString();
const events=[{runId,eventId:'start',type:'STARTED',occurredAt:startedAt,message:'Demo execution started.'},{runId,eventId:'finish',type:'COMPLETED',occurredAt:new Date().toISOString(),message:'Demo execution completed.'}];
for(const event of [...events,events[1]]) {
 const response=await fetch(base+'/ingest/workflows/'+encodeURIComponent(workflowId)+'/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(event),signal:AbortSignal.timeout(15000)});
 if(!response.ok) throw new Error('Ingestion returned HTTP '+response.status+'. Check your key, workflow and payload.');
 const result=await response.json();
 console.log(JSON.stringify({runId,status:result.run.status,duplicate:result.duplicate}));
}
