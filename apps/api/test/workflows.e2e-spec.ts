import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
describe('Authentication boundaries without a database', () => {
  let app: INestApplication;
  beforeEach(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); });
  afterEach(async () => { await app.close(); });
  it('removes the public development endpoint', async () => { await request(app.getHttpServer()).get('/dev/workflows').expect(404); });
  it('requires a session for workspaces', async () => { await request(app.getHttpServer()).get('/workspaces').expect(401); });
  it('rejects writes without an allowed origin', async () => { await request(app.getHttpServer()).post('/auth/register').send({}).expect(403); });
  it('rejects invalid registration before database access', async () => { await request(app.getHttpServer()).post('/auth/register').set('Origin', 'http://localhost:3000').set('X-Requested-With', 'AutomationMonitor').send({ email: 'invalid' }).expect(400); });
});
