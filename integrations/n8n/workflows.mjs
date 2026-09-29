// Reproducible n8n exports. Credentials are references, never embedded secrets.
import { randomUUID } from 'node:crypto';
export function createWorkflows({ workflowId, prefix = 'amorders', webhookPath = 'automation-monitor/orders', apiUrl = 'http://monitor-api:3001' }) {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(prefix)) throw new Error('Invalid integration prefix.');
  const mainId=prefix+'Main', errorId=prefix+'Errors';
  const monitorCredential={id:prefix+'MonitorKey',name:'Automation Monitor · orders'};
  const webhookCredential={id:prefix+'WebhookKey',name:'Orders webhook · local'};
  const endpoint=apiUrl+'/ingest/workflows/'+workflowId+'/events';
  const node=(name,type,parameters,x,y=0,extra={})=>({id:randomUUID(),name,type:'n8n-nodes-base.'+type,typeVersion:1,position:[x,y],parameters,...extra});
  const set=(name,expression,x,y=0)=>node(name,'set',{mode:'raw',jsonOutput:expression,options:{}},x,y,{typeVersion:3.4});
  const report=(name,x,y=0)=>node(name,'httpRequest',{method:'POST',url:endpoint,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ $json }}',options:{timeout:10000}},x,y,{typeVersion:4.3,credentials:{httpHeaderAuth:monitorCredential},retryOnFail:true,maxTries:3,waitBetweenTries:1000});
  const connect=(pairs)=>{const out={};for(const [from,to,output=0] of pairs){out[from]??={main:[]};while(out[from].main.length<=output)out[from].main.push([]);out[from].main[output].push({node:to,type:'main',index:0});}return out;};
  const main={id:mainId,name:'Automation Monitor · validate orders',active:false,nodes:[
    node('Order webhook','webhook',{httpMethod:'POST',path:webhookPath,authentication:'headerAuth',responseMode:'responseNode',options:{}},0,0,{typeVersion:2.1,webhookId:randomUUID(),credentials:{httpHeaderAuth:webhookCredential}}),
    set('Capture start',"={{ { runId: 'n8n:' + $execution.id, eventId: 'started', type: 'STARTED', occurredAt: $now.toUTC().toISO(), message: 'Order validation started.' } }}",240),
    report('Report started',480),
    node('Valid order?','if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:randomUUID(),leftValue:"={{ typeof $('Order webhook').first().json.body.orderId === 'string' && $('Order webhook').first().json.body.orderId.length > 0 && $('Order webhook').first().json.body.orderId.length <= 80 && typeof $('Order webhook').first().json.body.amount === 'number' && Number.isFinite($('Order webhook').first().json.body.amount) && $('Order webhook').first().json.body.amount > 0 && $('Order webhook').first().json.body.amount <= 1000000 }}",rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},720,0,{typeVersion:2.2}),
    set('Build receipt',"={{ { orderId: $('Order webhook').first().json.body.orderId, subtotal: $('Order webhook').first().json.body.amount, tax: Math.round($('Order webhook').first().json.body.amount * 0.1 * 100) / 100, total: Math.round($('Order webhook').first().json.body.amount * 1.1 * 100) / 100 } }}",960,-120),
    set('Capture completion',"={{ { runId: $('Capture start').first().json.runId, eventId: 'completed', type: 'COMPLETED', occurredAt: $now.toUTC().toISO(), message: 'Order validated and receipt calculated. No payment was taken.' } }}",1200,-120),
    report('Report completed',1440,-120),
    node('Return receipt','respondToWebhook',{respondWith:'json',responseBody:"={{ { accepted: true, executionId: $('Capture start').first().json.runId, receipt: $('Build receipt').first().json } }}",options:{responseCode:200}},1680,-120,{typeVersion:1.4}),
    node('Reject invalid order','stopAndError',{errorMessage:'Order must have an orderId and a positive numeric amount no greater than 1000000.'},960,160),
  ],connections:connect([['Order webhook','Capture start'],['Capture start','Report started'],['Report started','Valid order?'],['Valid order?','Build receipt',0],['Valid order?','Reject invalid order',1],['Build receipt','Capture completion'],['Capture completion','Report completed'],['Report completed','Return receipt']]),settings:{executionOrder:'v1',errorWorkflow:errorId,saveDataErrorExecution:'all',saveDataSuccessExecution:'all',saveManualExecutions:true,executionTimeout:120},pinData:{},versionId:randomUUID()};
  const errors={id:errorId,name:'Automation Monitor · report order failures',active:false,nodes:[
    node('Order failed','errorTrigger',{},0),
    // Missing execution IDs are activation/trigger errors, not executions we can identify.
    node('Has execution ID?','if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:randomUUID(),leftValue:'={{ !!$json.execution?.id }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},240,0,{typeVersion:2.2}),
    set('Capture failure',"={{ { runId: 'n8n:' + $('Order failed').first().json.execution.id, eventId: 'failed', type: 'FAILED', occurredAt: $now.toUTC().toISO(), message: 'Order automation failed. Inspect the linked n8n execution for details.' } }}",480),
    report('Report failed',720),
  ],connections:connect([['Order failed','Has execution ID?'],['Has execution ID?','Capture failure',0],['Capture failure','Report failed']]),settings:{executionOrder:'v1',saveDataErrorExecution:'all',saveDataSuccessExecution:'all'},pinData:{},versionId:randomUUID()};
  return {main,errors,monitorCredential,webhookCredential};
}
