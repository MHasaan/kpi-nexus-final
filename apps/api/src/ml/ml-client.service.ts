import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { RequestContextStore } from '../tenancy/request-context.js';
import { signMlRequest } from './ml-signature.js';
import { ML_HMAC_SPEC, resolveSecret } from '../config/secrets.js';

/**
 * HTTP client for the Python ML sidecar. Every call is HMAC-signed with the
 * org id from the request context (the sidecar verifies it), so a tenant can
 * never invoke the sidecar without an authenticated context. Failures surface
 * as 503 so callers/route handlers degrade gracefully.
 */
@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private readonly baseUrl = process.env.ML_SIDECAR_URL ?? 'http://127.0.0.1:8000';
  // Resolved per call, not in the constructor: a DI-time throw would pre-empt the
  // boot check that reports every insecure secret at once (OT-008).
  private get secret(): string {
    return resolveSecret(ML_HMAC_SPEC);
  }

  async post<T>(endpoint: string, payload: unknown): Promise<T> {
    const ctx = RequestContextStore.require();
    const ts = Date.now();
    const signature = signMlRequest(this.secret, ctx.organizationId, ts);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Tenant-Id': ctx.organizationId,
          'X-Signature-Timestamp': String(ts),
          'X-Signature': signature,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      this.logger.warn(`ML sidecar unreachable for ${endpoint}: ${String(err)}`);
      throw new ServiceUnavailableException({ code: 'ML_SIDECAR_UNAVAILABLE', message: 'ML service is unreachable' });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'ML_SIDECAR_ERROR',
        message: `ML sidecar ${endpoint} failed (${res.status})`,
        details: detail.slice(0, 300),
      });
    }
    return (await res.json()) as T;
  }
}
