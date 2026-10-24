import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ImportsService, type ImportJob } from './imports.service.js';

@Processor('invoice-imports')
export class ImportsProcessor extends WorkerHost {
  constructor(private readonly importsService: ImportsService) {
    super();
  }

  async process(job: Job<ImportJob>) {
    await this.importsService.process(job.data);
  }
}
