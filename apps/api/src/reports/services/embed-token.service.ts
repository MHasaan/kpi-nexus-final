import { createHmac, timingSafeEqual } from 'node:crypto';

import { GoneException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

// 30 days in seconds.
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Payload encoded inside the embed token. */
interface EmbedTokenPayload {
  kpiId: string;
  orgId: string;
  /** Unix epoch seconds — expiry time. */
  exp: number;
}

/** Public snapshot returned by resolve(). */
export interface EmbedKpiSnapshot {
  kpiId: string;
  kpiName: string;
  unit: string | null;
  latestValue: number | null;
  latestRecordedAt: Date | null;
  /** Up to 30 most-recent data points for sparkline rendering. */
  sparkline: Array<{ recordedAt: Date; value: number }>;
  /** Simple threshold status based on KPI fields. */
  thresholdStatus: 'ok' | 'warning' | 'critical' | 'unknown';
}

function b64urlEncode(s: string): string {
  return Buffer.from(s).toString('base64url');
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

function getSecret(): string {
  return process.env['EMBED_TOKEN_SECRET'] ?? 'dev-embed-secret-change-me-in-prod';
}

function hmacSign(payloadB64: string): string {
  return createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

@Injectable()
export class EmbedTokenService {
  private readonly logger = new Logger(EmbedTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mint a compact stateless HMAC embed token for the given KPI.
   * Format: `base64url(JSON payload) + '.' + base64url(HMAC-SHA256 signature)`
   * The token is valid for 30 days.
   */
  mint(kpiId: string): string {
    const ctx = RequestContextStore.require();
    const payload: EmbedTokenPayload = {
      kpiId,
      orgId: ctx.organizationId,
      exp: Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS,
    };
    const payloadB64 = b64urlEncode(JSON.stringify(payload));
    const sig = hmacSign(payloadB64);
    return `${payloadB64}.${sig}`;
  }

  /**
   * Resolve an embed token to a KPI snapshot.
   * Verifies HMAC + expiry; fetches latest value + sparkline data.
   * Runs inside RequestContextStore.runWithBypass() because this is a public
   * unauthenticated path — the orgId comes from the signed token, not a session.
   * Throws UnauthorizedException (401) on invalid/expired token.
   * Throws NotFoundException (404) if the KPI was deleted.
   */
  async resolve(token: string): Promise<EmbedKpiSnapshot> {
    return RequestContextStore.runWithBypass('embed-resolve', async () => {
      // Split into payload + signature parts.
      const dotIdx = token.lastIndexOf('.');
      if (dotIdx < 1) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Malformed embed token' });
      }
      const payloadB64 = token.slice(0, dotIdx);
      const receivedSig = token.slice(dotIdx + 1);

      // Constant-time HMAC comparison.
      const expectedSig = hmacSign(payloadB64);
      const expectedBuf = Buffer.from(expectedSig);
      const receivedBuf = Buffer.from(receivedSig);
      let valid = false;
      try {
        valid = expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
      } catch {
        valid = false;
      }
      if (!valid) {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid embed token signature' });
      }

      // Decode and verify payload.
      let payload: EmbedTokenPayload;
      try {
        payload = JSON.parse(b64urlDecode(payloadB64)) as EmbedTokenPayload;
      } catch {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Malformed embed token payload' });
      }

      if (!payload.kpiId || !payload.orgId || typeof payload.exp !== 'number') {
        throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Incomplete embed token payload' });
      }

      if (Math.floor(Date.now() / 1000) > payload.exp) {
        throw new GoneException({ code: 'TOKEN_EXPIRED', message: 'Embed token has expired' });
      }

      // Fetch the KPI (scoped to the token's org).
      const kpi = await this.prisma.kPI.findFirst({
        where: { id: payload.kpiId, organizationId: payload.orgId, deletedAt: null },
        select: {
          id: true,
          name: true,
          unit: true,
          targetValue: true,
          warningThreshold: true,
          criticalThreshold: true,
          direction: true,
        },
      });

      if (!kpi) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found or no longer exists' });
      }

      // Fetch sparkline — last 30 points descending.
      const points = await this.prisma.kPIDataPoint.findMany({
        where: { organizationId: payload.orgId, kpiId: payload.kpiId },
        select: { recordedAt: true, value: true },
        orderBy: { recordedAt: 'desc' },
        take: 30,
      });

      const latestPoint = points[0] ?? null;
      const latestValue = latestPoint?.value ?? null;

      // Compute threshold status using KPI simple threshold fields.
      const thresholdStatus = computeThresholdStatus(
        latestValue,
        kpi.targetValue,
        kpi.warningThreshold,
        kpi.criticalThreshold,
        kpi.direction,
      );

      return {
        kpiId: kpi.id,
        kpiName: kpi.name,
        unit: kpi.unit,
        latestValue,
        latestRecordedAt: latestPoint?.recordedAt ?? null,
        sparkline: points.map((p) => ({ recordedAt: p.recordedAt, value: p.value })),
        thresholdStatus,
      };
    });
  }
}

/**
 * Derive a simple threshold status from KPI fields.
 * Supports HIGHER_IS_BETTER and LOWER_IS_BETTER directions;
 * defaults to 'unknown' when no target/thresholds configured.
 */
function computeThresholdStatus(
  latestValue: number | null,
  targetValue: number | null,
  warningThreshold: number | null,
  criticalThreshold: number | null,
  direction: string,
): 'ok' | 'warning' | 'critical' | 'unknown' {
  if (latestValue === null) return 'unknown';
  if (criticalThreshold === null && warningThreshold === null) return 'unknown';

  if (direction === 'HIGHER_IS_BETTER') {
    if (criticalThreshold !== null && latestValue <= criticalThreshold) return 'critical';
    if (warningThreshold !== null && latestValue <= warningThreshold) return 'warning';
    return 'ok';
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (criticalThreshold !== null && latestValue >= criticalThreshold) return 'critical';
    if (warningThreshold !== null && latestValue >= warningThreshold) return 'warning';
    return 'ok';
  }

  // TARGET_IS_BEST / NEUTRAL — use percentage deviation from target.
  if (targetValue !== null) {
    const deviation = Math.abs(latestValue - targetValue) / (Math.abs(targetValue) || 1);
    if (criticalThreshold !== null && deviation >= criticalThreshold) return 'critical';
    if (warningThreshold !== null && deviation >= warningThreshold) return 'warning';
    return 'ok';
  }

  return 'unknown';
}
