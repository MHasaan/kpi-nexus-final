import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Which process runs the BullMQ processors (OT-003). The flag is read when the
 * module files load, so each case resets the module cache and imports afresh;
 * processors are then compared by class name. Walks the static module metadata,
 * so nothing connects to Postgres or Redis.
 */

const PROCESSORS = [
  'AlertEngineProcessor',
  'CalculationEngineProcessor',
  'EscalationProcessor',
  'InsightsProcessor',
  'NotificationDigestProcessor',
  'NotificationRetryProcessor',
  'OnboardingCleanupProcessor',
  'OutboundWebhookProcessor',
  'ReembedProcessor',
  'ScheduledReportProcessor',
].sort();

type ModuleRef = { name?: string; module?: ModuleRef; providers?: unknown[]; imports?: unknown[]; forwardRef?: () => ModuleRef };

/** Every provider class name reachable from `root`, following static and dynamic imports. */
function providerNames(root: ModuleRef): Set<string> {
  const names = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (entry: unknown): void => {
    if (!entry || seen.has(entry)) return;
    seen.add(entry);
    const ref = entry as ModuleRef;
    if (typeof ref.forwardRef === 'function') return visit(ref.forwardRef());
    const cls = (ref.module ?? ref) as object;
    const providers = [
      ...((Reflect.getMetadata('providers', cls) as unknown[] | undefined) ?? []),
      ...(ref.module ? (ref.providers ?? []) : []),
    ];
    for (const p of providers) {
      if (typeof p === 'function' && p.name) names.add(p.name);
    }
    const imports = [
      ...((Reflect.getMetadata('imports', cls) as unknown[] | undefined) ?? []),
      ...(ref.module ? (ref.imports ?? []) : []),
    ];
    imports.forEach(visit);
  };
  visit(root);
  return names;
}

const processorsIn = (root: ModuleRef): string[] =>
  [...providerNames(root)].filter((n) => PROCESSORS.includes(n)).sort();

async function load<T>(path: string, env: Record<string, string>): Promise<T> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import(path)) as T;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// Loading the whole API module graph takes a few seconds on a busy machine.
describe('queue processor placement', { timeout: 30_000 }, () => {
  it('runs every processor inside the API by default', async () => {
    const { AppModule } = await load<{ AppModule: ModuleRef }>('./app.module.js', {});
    expect(processorsIn(AppModule)).toEqual(PROCESSORS);
  });

  it('runs no processor inside the API when RUN_QUEUE_WORKERS=false', async () => {
    const { AppModule } = await load<{ AppModule: ModuleRef }>('./app.module.js', { RUN_QUEUE_WORKERS: 'false' });
    expect(processorsIn(AppModule)).toEqual([]);
  });

  it('runs every processor in the worker process', async () => {
    const { WorkerModule } = await load<{ WorkerModule: ModuleRef }>('./worker.module.js', {
      KPI_PROCESS_ROLE: 'worker',
    });
    expect(processorsIn(WorkerModule)).toEqual(PROCESSORS);
  });

  it('gives the worker process no HTTP controllers of its own', async () => {
    const { WorkerModule } = await load<{ WorkerModule: ModuleRef }>('./worker.module.js', {
      KPI_PROCESS_ROLE: 'worker',
    });
    expect(Reflect.getMetadata('controllers', WorkerModule) ?? []).toEqual([]);
  });
});
