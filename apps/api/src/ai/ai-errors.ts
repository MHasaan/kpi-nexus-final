import { HttpException, HttpStatus } from '@nestjs/common';

import type { AiProviderKey } from '@kpi-nexus/contracts';

/** Raised when a pre-flight budget check blocks a call in FAIL_CLOSED mode. */
export class AiBudgetExceededError extends HttpException {
  constructor(reason: 'DAILY_CAP' | 'MONTHLY_CAP') {
    super(
      {
        code: 'AI_BUDGET_EXCEEDED',
        message:
          reason === 'DAILY_CAP'
            ? 'Daily AI spend cap reached. Try again tomorrow or raise the cap in AI settings.'
            : 'Monthly AI spend cap reached. Raise the cap in AI settings to continue.',
        details: { reason },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Raised when every provider in the fallback chain failed. */
export class AiProviderUnavailableError extends HttpException {
  constructor(readonly attempted: Array<{ provider: AiProviderKey; error: string }>) {
    super(
      {
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: 'All configured AI providers failed for this request.',
        details: { attempted },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
