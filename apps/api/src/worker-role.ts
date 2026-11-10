/**
 * worker.ts's FIRST import: marks this process as the queue worker before any
 * other module loads, so instrumentation names the service and the processor
 * modules (config/queue-workers.ts) see the role when their files evaluate.
 */
process.env.KPI_PROCESS_ROLE = 'worker';
