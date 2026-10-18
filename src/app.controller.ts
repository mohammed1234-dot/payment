import { Controller, Get } from '@nestjs/common';
import { AppService, type HealthResponse } from './app.service.js';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET /v1/health: 200 when the API and its database respond, 503 otherwise. */
  @Get()
  checkHealth(): Promise<HealthResponse> {
    return this.appService.checkHealth();
  }
}
