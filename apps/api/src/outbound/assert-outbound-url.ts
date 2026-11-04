import { BadRequestException } from '@nestjs/common';

import { OutboundUrlBlockedError, validateOutboundUrl } from './outbound-fetch.js';

/**
 * Create/update-time guard for tenant-supplied target URLs: a URL that points
 * at an internal address (or isn't http/https) is a 400, not a stored config
 * that silently fails at delivery time.
 */
export async function assertOutboundUrl(url: unknown, field = 'url'): Promise<void> {
  if (typeof url !== 'string' || url.length === 0) return; // presence is the DTO's job
  try {
    await validateOutboundUrl(url);
  } catch (err) {
    if (err instanceof OutboundUrlBlockedError) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${field} is not allowed: ${err.reason}`,
        details: { field },
      });
    }
    throw err;
  }
}
