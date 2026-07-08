// Seed script for initial data
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test super admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@fluid-events.test' },
    update: {},
    create: {
      email: 'admin@fluid-events.test',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    },
  });

  console.log(`✅ Created super admin: ${superAdmin.email}`);

  // Create test manager
  const manager = await prisma.user.upsert({
    where: { email: 'manager@fluid-events.test' },
    update: {},
    create: {
      email: 'manager@fluid-events.test',
      name: 'Manager Test',
      role: 'MANAGER',
    },
  });

  console.log(`✅ Created manager: ${manager.email}`);

  // Create test client
  const client = await prisma.user.upsert({
    where: { email: 'client@fluid-events.test' },
    update: {},
    create: {
      email: 'client@fluid-events.test',
      name: 'Client Test',
      role: 'CLIENT',
    },
  });

  console.log(`✅ Created client: ${client.email}`);

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
