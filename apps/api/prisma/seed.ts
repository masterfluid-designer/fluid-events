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

  // Create a sample published event with tickets, owned by the test manager
  const event = await prisma.event.upsert({
    where: { slug: 'concert-festa-2026' },
    update: {},
    create: {
      slug: 'concert-festa-2026',
      title: 'Concert FESTA 2026',
      description:
        "La plus grande scène live d'Afrique de l'Ouest revient pour une nuit du 31 décembre. Trois plateaux, dix artistes, une seule nuit.",
      location: 'Palais des Sports, Abidjan',
      startDate: new Date('2026-12-31T20:00:00Z'),
      endDate: new Date('2027-01-01T02:00:00Z'),
      status: 'PUBLISHED',
      managerId: manager.id,
      tickets: {
        create: [
          {
            name: 'VIP Or',
            description: 'Accès backstage · open bar',
            price: 15000,
            currency: 'XOF',
            stock: 468,
            stockSold: 412,
          },
          {
            name: 'Standard',
            description: 'Accès général',
            price: 6000,
            currency: 'XOF',
            stock: 1320,
            stockSold: 689,
          },
          {
            name: 'Early Bird',
            description: 'Tarif de lancement',
            price: 4000,
            currency: 'XOF',
            stock: 139,
            stockSold: 139,
            isActive: false,
          },
        ],
      },
    },
  });

  console.log(`✅ Created event: ${event.slug}`);

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
