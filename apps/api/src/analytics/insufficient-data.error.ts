import { UnprocessableEntityException } from '@nestjs/common';

/**
 * The KPI has no data points (in the caller's visible window) to analyse. Raised
 * before calling the ML sidecar, which rejects empty series (BE-024) — otherwise
 * the caller would see a 503 "ML sidecar failed" for a plain data problem.
 */
export class InsufficientDataError extends UnprocessableEntityException {
  constructor(analysis: string) {
    super({
      code: 'INSUFFICIENT_DATA',
      message: `This KPI has no recorded values to ${analysis} yet.`,
    });
  }
}
