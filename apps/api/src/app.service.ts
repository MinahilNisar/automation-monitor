import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'automation-monitor-api';
  timestamp: string;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  // This reports API availability, not database or integration readiness.
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'automation-monitor-api',
      timestamp: new Date().toISOString(),
    };
  }
}
