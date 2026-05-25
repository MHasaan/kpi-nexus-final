/**
 * Local development seed.
 *
 * P0: intentionally empty — no models exist yet. Phase plans for P1+ add
 * organization/user/role seeders here. The full demo-org seed (10 roles,
 * 14 positions, 11 units, 20 KPIs, 5 categories) lands in P6 via the
 * Onboarding 2.0 sample-data flow, not this script.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Intentionally empty in P0.
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
