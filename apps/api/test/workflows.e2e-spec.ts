import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { WorkflowsService } from '../src/workflows/workflows.service.js';

describe('Development workflow route boundaries', () => {
  let app: INestApplication;
  beforeEach(async () => {
    vi.stubEnv('ENABLE_DEV_ROUTES', 'false');
    vi.stubEnv('NODE_ENV', 'test');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkflowsService).useValue({ list: () => [], runs: () => [] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });
  it('is unavailable without explicit opt-in', async () => { await request(app.getHttpServer()).get('/dev/workflows').expect(404); });
  it('is unavailable in production even with opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ENABLE_DEV_ROUTES', 'true');
    await request(app.getHttpServer()).get('/dev/workflows').expect(404);
  });
  it('allows opted-in development reads', async () => {
    vi.stubEnv('ENABLE_DEV_ROUTES', 'true');
    await request(app.getHttpServer()).get('/dev/workflows').expect(200).expect([]);
  });
  it('rejects malformed workflow IDs', async () => {
    vi.stubEnv('ENABLE_DEV_ROUTES', 'true');
    await request(app.getHttpServer()).get('/dev/workflows/not-a-uuid/runs').expect(400);
  });
});
