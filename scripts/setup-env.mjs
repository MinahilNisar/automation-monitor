import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const rootEnv = '.env';
if (!existsSync(rootEnv)) writeFileSync(rootEnv, 'POSTGRES_PASSWORD=' + randomBytes(24).toString('hex') + '\n');
const password = readFileSync(rootEnv, 'utf8').match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!password || !/^[a-zA-Z0-9_-]+$/.test(password)) throw new Error('Use an alphanumeric POSTGRES_PASSWORD in root .env.');
const apiFile = 'apps/api/.env';
let api = existsSync(apiFile) ? readFileSync(apiFile, 'utf8') : '';
const defaults = {
  PORT: '3001', FRONTEND_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://automation_monitor:' + password + '@127.0.0.1:5433/automation_monitor?schema=public',
};
for (const [key, value] of Object.entries(defaults)) {
  if (!new RegExp('^' + key + '=', 'm').test(api)) api += '\n' + key + '=' + value + '\n';
}
writeFileSync(apiFile, api);
console.log('Local environment files prepared; existing values preserved.');
