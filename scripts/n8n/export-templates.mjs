import { writeFileSync } from 'node:fs';
import { createWorkflows } from '../../integrations/n8n/workflows.mjs';
const built=createWorkflows({workflowId:'00000000-0000-4000-8000-000000000000'});
writeFileSync('integrations/n8n/order-validation.json',JSON.stringify(built.main,null,2)+'\n');
writeFileSync('integrations/n8n/order-errors.json',JSON.stringify(built.errors,null,2)+'\n');
console.log('Exported credential-free workflow templates. Replace the placeholder workflow UUID before manual use.');
