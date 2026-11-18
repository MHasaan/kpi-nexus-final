import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PERSONAL_DIGEST_JOB, PERSONAL_DIGEST_QUEUE } from './personal-digest.producer.js';
import { PersonalDigestService } from './personal-digest.service.js';

/** BullMQ worker for the `personal-digest` queue: sends what was kept for people who chose a digest. */
@Processor(PERSONAL_DIGEST_QUEUE)
export class PersonalDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(PersonalDigestProcessor.name);

  constructor(private readonly digests: PersonalDigestService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== PERSONAL_DIGEST_JOB) return;
    const { people, notifications } = await this.digests.sendDue();
    this.logger.log(`Personal digest sent to ${people} person(s), ${notifications} notification(s)`);
  }
}
