/**
 * Which process runs the BullMQ processors (OT-003).
 *
 * The same code runs as two processes: the API (`dist/main.js`) and the worker
 * (`dist/worker.js`, which sets KPI_PROCESS_ROLE=worker). By default the API
 * runs the processors itself, so local dev and CI need one process; production
 * sets RUN_QUEUE_WORKERS=false on the API and runs the worker beside it. The
 * API keeps its producers either way, so it can still enqueue jobs.
 *
 * Read when the module files load: `@nestjs/bullmq` starts a BullMQ worker for
 * every @Processor provider it finds, so a disabled process simply leaves them
 * out of its providers.
 */

type Env = Record<string, string | undefined>;

export function queueWorkersEnabled(env: Env = process.env): boolean {
  const raw = env.RUN_QUEUE_WORKERS;
  if (raw !== undefined && raw !== '' && raw !== 'true' && raw !== 'false') {
    throw new Error(`RUN_QUEUE_WORKERS must be "true" or "false", got "${raw}"`);
  }
  if (env.KPI_PROCESS_ROLE === 'worker') {
    if (raw === 'false') throw new Error('RUN_QUEUE_WORKERS=false makes no sense for the worker process');
    return true;
  }
  return raw !== 'false';
}

/** `providers` entry for a module's processors: the classes, or none when disabled. */
export function queueProcessors<T>(classes: T[], env: Env = process.env): T[] {
  return queueWorkersEnabled(env) ? classes : [];
}
