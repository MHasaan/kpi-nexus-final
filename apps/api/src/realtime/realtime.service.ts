import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Observable, Subject } from 'rxjs';

import type { RealtimeEvent, RealtimeStreamQuery } from '@kpi-nexus/contracts';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Returns true when `event` satisfies `filters`.
 *
 * Rules:
 *  - `ping` events always pass so clients maintain connection awareness
 *    even when a kpiId or dashboardId filter is active.
 *  - For any other event type, if no filter fields are set, the event passes.
 *  - If `kpiId` is set, the event's `kpiId` field must match.
 *  - If `dashboardId` is set, the event's `dashboardId` field must match.
 *  - Both filters are ANDed when both are set.
 *
 * Exported as a pure function so it can be unit-tested without Redis.
 */
export function eventMatchesFilter(
  event: RealtimeEvent,
  filters: RealtimeStreamQuery,
): boolean {
  // ping / heartbeat-style events always pass — clients need them to know
  // the connection is alive regardless of what they are filtering for.
  if (event.type === 'ping') return true;

  const { kpiId, dashboardId } = filters;

  // data_point_added carries kpiId and (optionally) dashboardId
  if (event.type === 'data_point_added') {
    if (kpiId !== undefined && event.kpiId !== kpiId) return false;
    if (dashboardId !== undefined && event.dashboardId !== dashboardId) return false;
    return true;
  }

  // For future event types that haven't been fully modelled yet, pass
  // through when no filter is set; otherwise hold back until those event
  // schemas are wired in.
  if (kpiId !== undefined || dashboardId !== undefined) return false;
  return true;
}

/**
 * RealtimeService — publishes and fans out org-scoped events over Redis
 * pub/sub to SSE clients.
 *
 * Connection strategy: ONE shared subscriber Redis connection per service
 * instance, subscribed to whichever `realtime:{orgId}` channels currently
 * have active SSE listeners. Messages are fanned out to per-channel rxjs
 * Subjects and filtered per-subscription. A separate publisher connection is
 * used so we can PUBLISH while the subscriber connection is in subscribe mode
 * (ioredis restriction).
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);

  private readonly pub: Redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
  });

  private readonly sub: Redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
  });

  /** orgId → Subject<RealtimeEvent> that fans to all active subscriptions */
  private readonly subjects = new Map<string, Subject<RealtimeEvent>>();

  /** orgId → number of active rxjs subscriptions watching that channel */
  private readonly refCounts = new Map<string, number>();

  private subConnected = false;

  constructor() {
    // Wire the subscriber message handler once at construction time.
    this.sub.on('message', (channel: string, message: string) => {
      const orgId = channel.replace(/^realtime:/, '');
      const subject = this.subjects.get(orgId);
      if (!subject) return;

      let event: RealtimeEvent;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        event = JSON.parse(message) as RealtimeEvent;
      } catch {
        this.logger.warn(`RealtimeService: failed to parse message on ${channel}`);
        return;
      }
      subject.next(event);
    });

    this.sub.on('error', (err: Error) => {
      this.logger.warn(`RealtimeService subscriber error: ${err.message}`);
    });

    this.pub.on('error', (err: Error) => {
      this.logger.warn(`RealtimeService publisher error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.pub.quit();
    } catch (err) {
      this.logger.warn(`RealtimeService: publisher quit failed: ${String(err)}`);
    }
    try {
      await this.sub.quit();
    } catch (err) {
      this.logger.warn(`RealtimeService: subscriber quit failed: ${String(err)}`);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Publish an event to all SSE clients subscribed to this org's channel.
   * Non-fatal: a Redis error logs a warning but does not bubble up.
   */
  async publish(orgId: string, event: RealtimeEvent): Promise<void> {
    const channel = `realtime:${orgId}`;
    try {
      await this.pub.publish(channel, JSON.stringify(event));
    } catch (err) {
      // Intentionally non-fatal — a Redis hiccup must NOT fail a data write.
      this.logger.warn(`RealtimeService: publish to ${channel} failed: ${String(err)}`);
    }
  }

  /**
   * Subscribe to org-scoped realtime events, optionally filtered by kpiId
   * and/or dashboardId. Returns an rxjs Observable that completes when the
   * caller unsubscribes (teardown removes the Redis SUBSCRIBE if no other
   * callers remain for that org channel).
   */
  subscribe(orgId: string, filters: RealtimeStreamQuery): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>((subscriber) => {
      // Ensure a Subject exists for this org channel.
      if (!this.subjects.has(orgId)) {
        this.subjects.set(orgId, new Subject<RealtimeEvent>());
      }
      const subject = this.subjects.get(orgId)!;

      // Subscribe the Redis channel when first listener attaches.
      const prev = this.refCounts.get(orgId) ?? 0;
      this.refCounts.set(orgId, prev + 1);
      if (prev === 0) {
        void this.ensureSubscribed(orgId);
      }

      // Fan the Subject into this rxjs subscriber, applying event filters.
      const inner = subject.subscribe({
        next: (event) => {
          if (eventMatchesFilter(event, filters)) {
            subscriber.next(event);
          }
        },
        error: (err: unknown) => subscriber.error(err),
        // Subject never completes on its own; we complete from teardown.
      });

      // Teardown: called when the SSE connection closes (req.raw 'close').
      return () => {
        inner.unsubscribe();
        const remaining = (this.refCounts.get(orgId) ?? 1) - 1;
        this.refCounts.set(orgId, remaining);
        if (remaining <= 0) {
          this.refCounts.delete(orgId);
          const s = this.subjects.get(orgId);
          if (s) {
            s.complete();
            this.subjects.delete(orgId);
          }
          void this.sub.unsubscribe(`realtime:${orgId}`);
        }
      };
    });
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private async ensureSubscribed(orgId: string): Promise<void> {
    if (!this.subConnected) {
      this.subConnected = true;
    }
    try {
      await this.sub.subscribe(`realtime:${orgId}`);
    } catch (err) {
      this.logger.warn(`RealtimeService: subscribe to realtime:${orgId} failed: ${String(err)}`);
    }
  }
}
