import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

export interface EchoJobData {
  message: string;
}

export interface EchoJobResult {
  id: string;
  received: string;
}

@Processor('echo')
export class EchoProcessor extends WorkerHost {
  private readonly logger = new Logger(EchoProcessor.name);

  async process(job: Job<EchoJobData>): Promise<EchoJobResult> {
    this.logger.log(
      `echo job ${job.id ?? '?'}: ${JSON.stringify(job.data)}`,
    );
    return { id: String(job.id ?? ''), received: job.data.message };
  }
}
