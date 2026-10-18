import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';

export interface HealthResponse {
  status: 'ok';
  database: 'up';
}

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  async checkHealth(): Promise<HealthResponse> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', database: 'up' };
  }
}
