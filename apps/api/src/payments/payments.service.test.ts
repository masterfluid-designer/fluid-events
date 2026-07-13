/**
 * Tests unitaires — PaymentsService
 * Init (réservation stock atomique + Order PENDING) et webhook Kkiapay
 * (signature, idempotence, re-vérification serveur anti-fraude, rollback stock).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ALREADY_PROCESSED } from './webhook-idempotency.service';
import { PaymentProviderType } from '@saas-events/types';

const REQUEST_USER = { id: 'user-1', email: 'client@x.com', role: 'CLIENT' } as any;

const ACTIVE_TICKET = {
  id: 'tk-1',
  eventId: 'ev-1',
  isActive: true,
  price: 5000,
  currency: 'XOF',
  stock: 100,
  stockSold: 0,
  saleStartDate: null as Date | null,
  saleEndDate: null as Date | null,
  event: { id: 'ev-1', status: 'PUBLISHED' },
};

const PROVIDER_CONFIG = {
  eventId: 'ev-1',
  provider: 'KKIAPAY',
  isActive: true,
  publicKey: 'pub-key',
  privateKey: 'enc:priv',
  webhookSecret: 'enc:secret',
};

function makeDeps() {
  return {
    stockService: {
      checkStockAvailable: vi.fn().mockReturnValue(true),
      decrementStockAtomic: vi.fn().mockResolvedValue(true),
      releaseStockAtomic: vi.fn().mockResolvedValue(undefined),
    },
    webhookIdempotency: { recordOrSkip: vi.fn().mockResolvedValue(true) },
    clientProfileService: { enrichClientProfile: vi.fn().mockResolvedValue(undefined) },
    crypto: {
      decrypt: vi.fn((v: string) => `decrypted:${v}`),
      safeEqual: vi.fn().mockReturnValue(true),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
    kkiapayService: { verifyTransaction: vi.fn() },
    ticketDesignService: { generateQrToken: vi.fn().mockReturnValue('qr-token') },
    pdfQueueService: { enqueueGeneratePdf: vi.fn().mockResolvedValue(undefined) },
  };
}

function makePrisma(
  overrides: { ticket?: any; providerConfig?: any; order?: any; orders?: any[] } = {},
) {
  const tx = {
    ticket: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    order: {
      create: vi.fn().mockImplementation((args: any) => Promise.resolve({ id: 'order-1', ...args.data })),
      update: vi.fn().mockResolvedValue({}),
    },
    orderItem: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    ticket: { findUnique: vi.fn().mockResolvedValue(overrides.ticket ?? null) },
    paymentProviderConfig: { findUnique: vi.fn().mockResolvedValue(overrides.providerConfig ?? null) },
    order: {
      findUnique: vi.fn().mockResolvedValue(overrides.order ?? null),
      findMany: vi.fn().mockResolvedValue(overrides.orders ?? []),
    },
    $transaction: vi.fn().mockImplementation((fn: any) => fn(tx)),
    _tx: tx,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>, prisma: ReturnType<typeof makePrisma>) {
  return new PaymentsService(
    prisma as any,
    deps.stockService as any,
    deps.webhookIdempotency as any,
    deps.clientProfileService as any,
    deps.crypto as any,
    deps.audit as any,
    deps.kkiapayService as any,
    deps.ticketDesignService as any,
    deps.pdfQueueService as any,
  );
}

describe('PaymentsService.initPayment()', () => {
  it('crée Order PENDING + OrderItem et retourne les paramètres du widget Kkiapay', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    const result = await service.initPayment(REQUEST_USER, {
      ticketId: 'tk-1',
      provider: PaymentProviderType.KKIAPAY,
    });

    expect(result).toEqual({
      provider: 'KKIAPAY',
      orderId: 'order-1',
      partnerId: 'order-1',
      amount: 5000,
      currency: 'XOF',
      publicKey: 'pub-key',
      sandbox: true,
    });
    expect(deps.stockService.decrementStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 100, 1);
    expect(prisma._tx.order.create).toHaveBeenCalled();
    expect(prisma._tx.orderItem.create).toHaveBeenCalled();
  });

  it('refuse un provider non supporté (V1 = Kkiapay uniquement)', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.CINETPAY }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('404 si le billet est introuvable ou inactif', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: null });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'unknown', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(NotFoundException);
  });

  it("refuse si l'événement n'est pas PUBLISHED", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({
      ticket: { ...ACTIVE_TICKET, event: { id: 'ev-1', status: 'DRAFT' } },
      providerConfig: PROVIDER_CONFIG,
    });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuse si la vente n'a pas encore commencé", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({
      ticket: { ...ACTIVE_TICKET, saleStartDate: new Date(Date.now() + 3600_000) },
      providerConfig: PROVIDER_CONFIG,
    });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse si la vente est terminée', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({
      ticket: { ...ACTIVE_TICKET, saleEndDate: new Date(Date.now() - 3600_000) },
      providerConfig: PROVIDER_CONFIG,
    });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse si le stock est épuisé (pré-check)', async () => {
    const deps = makeDeps();
    deps.stockService.checkStockAvailable.mockReturnValue(false);
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuse si le provider Kkiapay n'est pas configuré/actif", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: { ...PROVIDER_CONFIG, isActive: false } });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('propage une race condition de stock perdue (STOCK_RACE_CONDITION)', async () => {
    const deps = makeDeps();
    deps.stockService.decrementStockAtomic.mockResolvedValue(false);
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1', provider: PaymentProviderType.KKIAPAY }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma._tx.order.create).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.getOrderForClient()', () => {
  const ORDER = {
    id: 'order-1',
    clientId: 'user-1',
    status: 'PAID',
    totalAmount: 5000,
    currency: 'XOF',
    paidAt: new Date('2026-07-12T10:00:00Z'),
    items: [{ id: 'oi-1', isScanned: false, qrCode: 'signed-jwt', ticket: { name: 'VIP' } }],
  };

  it('retourne le statut de la commande pour son propriétaire', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ order: ORDER });
    const service = makeService(deps, prisma);

    const result = await service.getOrderForClient(REQUEST_USER, 'order-1');

    expect(result).toEqual({
      id: 'order-1',
      status: 'PAID',
      totalAmount: 5000,
      currency: 'XOF',
      paidAt: ORDER.paidAt,
      items: [{ id: 'oi-1', ticketName: 'VIP', hasTicket: true, isScanned: false, qrCode: 'signed-jwt' }],
    });
  });

  it('404 si la commande est introuvable', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ order: null });
    const service = makeService(deps, prisma);

    await expect(service.getOrderForClient(REQUEST_USER, 'unknown')).rejects.toThrow(NotFoundException);
  });

  it("403 si la commande n'appartient pas au client authentifié", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ order: { ...ORDER, clientId: 'other-user' } });
    const service = makeService(deps, prisma);

    await expect(service.getOrderForClient(REQUEST_USER, 'order-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('PaymentsService.listOrdersForClient()', () => {
  const ORDERS = [
    {
      id: 'order-2',
      orderNumber: 'ORD-2',
      status: 'PAID',
      totalAmount: 6000,
      currency: 'XOF',
      paidAt: new Date('2026-07-10T10:00:00Z'),
      createdAt: new Date('2026-07-10T09:00:00Z'),
      event: { title: 'Concert FESTA 2026', startDate: new Date('2026-12-31T20:00:00Z'), location: 'Abidjan' },
      items: [{ id: 'oi-2', isScanned: false, qrCode: 'signed-jwt-2', ticket: { name: 'Standard' } }],
    },
    {
      id: 'order-1',
      orderNumber: 'ORD-1',
      status: 'PENDING',
      totalAmount: 15000,
      currency: 'XOF',
      paidAt: null,
      createdAt: new Date('2026-07-09T09:00:00Z'),
      event: { title: 'Concert FESTA 2026', startDate: new Date('2026-12-31T20:00:00Z'), location: 'Abidjan' },
      items: [{ id: 'oi-1', isScanned: false, qrCode: null, ticket: { name: 'VIP' } }],
    },
  ];

  it("liste les commandes du client, scindées par ownership via le WHERE (pas d'autre commande visible)", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ orders: ORDERS });
    const service = makeService(deps, prisma);

    const result = await service.listOrdersForClient(REQUEST_USER);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'user-1' } }),
    );
    expect(result).toEqual([
      {
        id: 'order-2',
        orderNumber: 'ORD-2',
        status: 'PAID',
        totalAmount: 6000,
        currency: 'XOF',
        paidAt: ORDERS[0].paidAt,
        createdAt: ORDERS[0].createdAt,
        event: ORDERS[0].event,
        items: [{ id: 'oi-2', ticketName: 'Standard', hasTicket: true, isScanned: false }],
      },
      {
        id: 'order-1',
        orderNumber: 'ORD-1',
        status: 'PENDING',
        totalAmount: 15000,
        currency: 'XOF',
        paidAt: null,
        createdAt: ORDERS[1].createdAt,
        event: ORDERS[1].event,
        items: [{ id: 'oi-1', ticketName: 'VIP', hasTicket: false, isScanned: false }],
      },
    ]);
  });

  it('retourne un tableau vide si le client n\'a aucune commande', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ orders: [] });
    const service = makeService(deps, prisma);

    const result = await service.listOrdersForClient(REQUEST_USER);
    expect(result).toEqual([]);
  });
});

describe('PaymentsService.handleKkiapayWebhook()', () => {
  const PENDING_ORDER = {
    id: 'order-1',
    clientId: 'user-1',
    eventId: 'ev-1',
    status: 'PENDING',
    totalAmount: 5000,
    currency: 'XOF',
    event: { id: 'ev-1', endDate: new Date(Date.now() + 3600_000) },
    items: [{ id: 'oi-1', ticketId: 'tk-1', ticket: { stock: 100 } }],
  };

  const SUCCESS_PAYLOAD = {
    transactionId: 'tx-1',
    isPaymentSucces: true,
    event: 'transaction.success' as const,
    partnerId: 'order-1',
    amount: 5000,
  };

  it('rejette (401) une signature webhook invalide', async () => {
    const deps = makeDeps();
    deps.crypto.safeEqual.mockReturnValue(false);
    // La config est résolue par (eventId, provider) — l'Order doit être
    // trouvé pour connaître l'événement avant même de vérifier la signature.
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'wrong-secret')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(deps.kkiapayService.verifyTransaction).not.toHaveBeenCalled();
  });

  it('rejette (401) si aucun provider Kkiapay configuré pour cet événement', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: null, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('webhook déjà traité (idempotence) → no-op silencieux', async () => {
    const deps = makeDeps();
    deps.webhookIdempotency.recordOrSkip.mockResolvedValue(ALREADY_PROCESSED);
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret');

    expect(deps.kkiapayService.verifyTransaction).not.toHaveBeenCalled();
  });

  it('partnerId absent → audit log et no-op sans exception', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook({ ...SUCCESS_PAYLOAD, partnerId: undefined } as any, 'secret');

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'missing_partner_id' }),
    );
  });

  it('Order introuvable → audit log et no-op sans exception', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: null });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret');

    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'order_not_found' }),
    );
  });

  it('Order déjà PAID (rejoué hors transactionId) → no-op sans re-vérification', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: { ...PENDING_ORDER, status: 'PAID' } });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret');

    expect(deps.kkiapayService.verifyTransaction).not.toHaveBeenCalled();
  });

  it('succès confirmé (webhook + vérification serveur) → Order PAID + QR généré + profil enrichi', async () => {
    const deps = makeDeps();
    deps.kkiapayService.verifyTransaction.mockResolvedValue({
      status: 'SUCCESS',
      amount: 5000,
      transactionId: 'tx-1',
    });
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret');

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'PAID', paymentRef: 'tx-1' }),
    });
    expect(prisma._tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'oi-1' },
      data: { qrCode: 'qr-token' },
    });
    expect(deps.clientProfileService.enrichClientProfile).toHaveBeenCalledWith('user-1', SUCCESS_PAYLOAD);
    expect(deps.pdfQueueService.enqueueGeneratePdf).toHaveBeenCalledWith('oi-1');
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.success',
      'Order',
      'order-1',
      expect.objectContaining({ transactionId: 'tx-1' }),
    );
    expect(deps.stockService.releaseStockAtomic).not.toHaveBeenCalled();
  });

  it('transaction échouée côté provider → Order FAILED + stock relâché', async () => {
    const deps = makeDeps();
    deps.kkiapayService.verifyTransaction.mockResolvedValue({
      status: 'FAILED',
      amount: 5000,
      transactionId: 'tx-1',
    });
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(
      { ...SUCCESS_PAYLOAD, isPaymentSucces: false, event: 'transaction.failed' } as any,
      'secret',
    );

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(deps.stockService.releaseStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 1);
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      'order-1',
      expect.objectContaining({ reason: 'payment_failed' }),
    );
  });

  it('webhook dit succès MAIS la vérification serveur ne concorde pas (montant différent) → traité comme échec', async () => {
    const deps = makeDeps();
    deps.kkiapayService.verifyTransaction.mockResolvedValue({
      status: 'SUCCESS',
      amount: 9999, // ne correspond pas à order.totalAmount (5000) → fraude potentielle
      transactionId: 'tx-1',
    });
    const prisma = makePrisma({ providerConfig: PROVIDER_CONFIG, order: PENDING_ORDER });
    const service = makeService(deps, prisma);

    await service.handleKkiapayWebhook(SUCCESS_PAYLOAD as any, 'secret');

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      'order-1',
      expect.objectContaining({ reason: 'verification_mismatch' }),
    );
  });
});
