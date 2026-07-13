// Seed script for initial data
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createCipheriv, randomBytes } from 'crypto';

const prisma = new PrismaClient();

/** Génère un token QR — même contrat que TicketDesignService.generateQrToken. */
function signQrToken(orderItemId: string, eventId: string, ticketId: string, eventEndDate: Date) {
  const secret = process.env.QR_SECRET;
  if (!secret) throw new Error('QR_SECRET manquant — impossible de seeder un QR.');
  const now = Math.floor(Date.now() / 1000);
  const graceSeconds = 24 * 60 * 60;
  const exp = Math.floor(eventEndDate.getTime() / 1000) + graceSeconds;
  return jwt.sign(
    { oid: orderItemId, eid: eventId, tid: ticketId, iat: now, exp },
    secret,
    { algorithm: 'HS256' },
  );
}

/** Chiffrement AES-256-GCM — même format que CryptoService (`iv:tag:encrypted`). */
function encrypt(plaintext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY manquant — impossible de seeder les clés provider.');
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Comptes de test — login email/password via POST /api/auth/login
 * (2 par rôle CLIENT/MANAGER/SUPER_ADMIN, mot de passe en clair ci-dessous
 * uniquement pour le seed/dev — jamais en prod).
 */
const TEST_ACCOUNTS = [
  { email: 'admin1@fluid-events.test', name: 'Super Admin 1', role: 'SUPER_ADMIN' as const, password: 'admin123' },
  { email: 'admin2@fluid-events.test', name: 'Super Admin 2', role: 'SUPER_ADMIN' as const, password: 'admin123' },
  { email: 'manager1@fluid-events.test', name: 'Manager Test 1', role: 'MANAGER' as const, password: 'manager123' },
  { email: 'manager2@fluid-events.test', name: 'Manager Test 2', role: 'MANAGER' as const, password: 'manager123' },
  { email: 'client1@fluid-events.test', name: 'Client Test 1', role: 'CLIENT' as const, password: 'client123' },
  { email: 'client2@fluid-events.test', name: 'Client Test 2', role: 'CLIENT' as const, password: 'client123' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Comptes de test avec mot de passe (login simple, en plus de Google OAuth)
  const usersByEmail: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>> = {};
  for (const account of TEST_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 10);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { passwordHash },
      create: {
        email: account.email,
        name: account.name,
        role: account.role,
        passwordHash,
      },
    });
    usersByEmail[account.email] = user;
    console.log(`✅ Created ${account.role.toLowerCase()}: ${user.email} (mot de passe : ${account.password})`);
  }

  const superAdmin = usersByEmail['admin1@fluid-events.test'];
  const manager = usersByEmail['manager1@fluid-events.test'];
  const client = usersByEmail['client1@fluid-events.test'];

  // Create a sample published event with tickets, owned by the test manager
  const event = await prisma.event.upsert({
    where: { slug: 'concert-festa-2026' },
    // managerId ré-assigné à chaque run : sans ça, un événement seedé par une
    // ancienne version de ce script (avec un autre compte manager) resterait
    // détenu par un compte qui n'existe plus dans TEST_ACCOUNTS.
    update: { managerId: manager.id },
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

  // Provider Kkiapay (CDC §8) — config PAR ÉVÉNEMENT depuis le 2026-07-13
  // (décision produit, supersède BUSINESS.md §6). Clés placeholder SANDBOX :
  // POST /api/payments/init fonctionne (Order réservé) mais le widget/la
  // vérification serveur échoueront (clés invalides côté Kkiapay).
  await prisma.paymentProviderConfig.upsert({
    where: { eventId_provider: { eventId: event.id, provider: 'KKIAPAY' } },
    update: {},
    create: {
      eventId: event.id,
      provider: 'KKIAPAY',
      isActive: true,
      publicKey: 'sandbox_placeholder_public_key',
      privateKey: encrypt('sandbox_placeholder_private_key'),
      webhookSecret: encrypt('sandbox_placeholder_webhook_secret'),
    },
  });
  console.log(`✅ Created payment provider config: KKIAPAY for ${event.slug} (clés placeholder sandbox — à remplacer pour un vrai test)`);

  // Create a test scanner account (email/password login, CDC §7.5)
  const scannerPasswordHash = await bcrypt.hash('scanner123', 10);
  const scannerUser = await prisma.user.upsert({
    where: { email: 'scanner@fluid-events.test' },
    update: {},
    create: {
      email: 'scanner@fluid-events.test',
      name: 'Scanner Entrée Nord',
      role: 'SCANNER',
      passwordHash: scannerPasswordHash,
    },
  });

  const scanner = await prisma.scanner.upsert({
    where: { userId: scannerUser.id },
    update: {},
    create: {
      userId: scannerUser.id,
      eventId: event.id,
      name: 'Entrée Nord',
    },
  });

  console.log(`✅ Created scanner: ${scannerUser.email} (mot de passe : scanner123)`);

  // Create a paid order + a scannable ticket (QR) so the scan flow is testable end-to-end
  const vipTicket = await prisma.ticket.findFirstOrThrow({
    where: { eventId: event.id, name: 'VIP Or' },
  });

  const order = await prisma.order.upsert({
    where: { orderNumber: 'ORD-SEED-0001' },
    // clientId ré-assigné à chaque run — même piège que managerId ci-dessus.
    update: { clientId: client.id },
    create: {
      orderNumber: 'ORD-SEED-0001',
      eventId: event.id,
      clientId: client.id,
      status: 'PAID',
      totalAmount: vipTicket.price,
      currency: vipTicket.currency,
      paymentProvider: 'KKIAPAY',
      paidAt: new Date(),
    },
  });

  let orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
  if (!orderItem) {
    orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        ticketId: vipTicket.id,
        unitPrice: vipTicket.price,
      },
    });
  }

  if (!orderItem.qrCode) {
    const qrCode = signQrToken(orderItem.id, event.id, vipTicket.id, event.endDate);
    orderItem = await prisma.orderItem.update({
      where: { id: orderItem.id },
      data: { qrCode },
    });
  }

  console.log(`✅ Created order ${order.orderNumber} — QR de test :\n${orderItem.qrCode}`);
  console.log(`   → scanner : ${scanner.name} (eventId=${scanner.eventId})`);

  console.log('\n📋 Comptes de test (POST /api/auth/login) :');
  for (const account of TEST_ACCOUNTS) {
    console.log(`   ${account.role.padEnd(11)} ${account.email} / ${account.password}`);
  }
  console.log(`   SCANNER     ${scannerUser.email} / scanner123  (via /api/auth/login/scanner)`);
  console.log(`   → super admin de référence : ${superAdmin.email}`);

  console.log('\n🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
