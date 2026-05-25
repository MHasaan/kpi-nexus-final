import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient.
 *
 * NestJS apps wrap this with an injectable PrismaService; scripts and
 * standalone tooling can import `prisma` directly. In development we cache
 * the instance on globalThis so hot-reload doesn't leak connections.
 */
const globalForPrisma = globalThis as unknown as {
  __kpiNexusPrisma?: PrismaClient;
};

const createClient = (): PrismaClient =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

export const prisma: PrismaClient = globalForPrisma.__kpiNexusPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__kpiNexusPrisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export type { Prisma } from '@prisma/client';
