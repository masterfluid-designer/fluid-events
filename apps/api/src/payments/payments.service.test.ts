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
import { computeCinetPayHmac } from './cinetpay.service';
import { PaymentProviderType } from '@saas-events/types';

const REQUEST_USER = { id: 'user-1', email: 'client@x.com', role: 'CLIENT' } as any;

const ACTIVE_TICKET = {
  id: 'tk-1',
  eventId: 'ev-1',
  isActive: true,
  name: 'VIP',
  price: 5000,
  currency: 'XOF',
  stock: 100,
  stockSold: 0,
  saleStartDate: null as Date | null,
  saleEndDate: null as Date | null,
  event: { id: 'ev-1', status: 'PUBLISHED', slug: 'concert-2026' },
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
    cinetPayService: { initPayment: vi.fn(), checkTransaction: vi.fn() },
    fedaPayService: { initPayment: vi.fn(), getTransactionStatus: vi.fn(), constructWebhookEvent: vi.fn() },
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
    paymentProviderConfig: {
      findUnique: vi.fn().mockResolvedValue(overrides.providerConfig ?? null),
      findFirst: vi.fn().mockResolvedValue(overrides.providerConfig ?? null),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(overrides.order ?? null),
      findFirst: vi.fn().mockResolvedValue(overrides.order ?? null),
      findMany: vi.fn().mockResolvedValue(overrides.orders ?? []),
      update: vi.fn().mockResolvedValue({}),
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
    deps.cinetPayService as any,
    deps.fedaPayService as any,
    deps.ticketDesignService as any,
    deps.pdfQueueService as any,
  );
}

describe('PaymentsService.initPayment()', () => {
  it('crée Order PENDING + OrderItem et retourne les paramètres du widget Kkiapay', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    const result = await service.initPayment(REQUEST_USER, { ticketId: 'tk-1' });

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

  it('CINETPAY : appelle CinetPayService.initPayment et retourne checkoutUrl', async () => {
    const deps = makeDeps();
    deps.cinetPayService.initPayment.mockResolvedValue({
      paymentToken: 'tok-1',
      paymentUrl: 'https://checkout.cinetpay.com/payment/tok-1',
    });
    const cinetPayConfig = {
      eventId: 'ev-1',
      provider: 'CINETPAY',
      isActive: true,
      publicKey: null,
      privateKey: 'enc:apikey',
      webhookSecret: 'enc:hmac-secret',
      config: { siteId: 'site-123' },
    };
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: cinetPayConfig });
    const service = makeService(deps, prisma);

    const result = await service.initPayment(REQUEST_USER, { ticketId: 'tk-1' });

    expect(result).toEqual({
      provider: 'CINETPAY',
      orderId: 'order-1',
      checkoutUrl: 'https://checkout.cinetpay.com/payment/tok-1',
    });
    expect(deps.cinetPayService.initPayment).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'decrypted:enc:apikey', siteId: 'site-123' }),
      expect.objectContaining({ transactionId: 'order-1', amount: 5000, currency: 'XOF' }),
    );
  });

  it('FEDAPAY : appelle FedaPayService.initPayment, stocke transactionId sur Order.paymentRef, retourne checkoutUrl', async () => {
    const deps = makeDeps();
    deps.fedaPayService.initPayment.mockResolvedValue({
      transactionId: '999',
      checkoutUrl: 'https://checkout.fedapay.com/pay/xyz',
    });
    const fedaPayConfig = {
      eventId: 'ev-1',
      provider: 'FEDAPAY',
      isActive: true,
      publicKey: 'pub-fp',
      privateKey: 'enc:secretkey',
      webhookSecret: 'enc:whsec',
      config: { environment: 'sandbox' },
    };
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: fedaPayConfig });
    const service = makeService(deps, prisma);

    const result = await service.initPayment(REQUEST_USER, { ticketId: 'tk-1' });

    expect(result).toEqual({ provider: 'FEDAPAY', orderId: 'order-1', checkoutUrl: 'https://checkout.fedapay.com/pay/xyz' });
    expect(deps.fedaPayService.initPayment).toHaveBeenCalledWith(
      expect.objectContaining({ secretKey: 'decrypted:enc:secretkey', environment: 'sandbox' }),
      expect.objectContaining({ amount: 5000, currency: 'XOF' }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { paymentRef: '999' } });
  });

  it("CINETPAY : si l'appel externe échoue, annule l'Order + relâche le stock + 503 (pas de reservation orpheline)", async () => {
    const deps = makeDeps();
    deps.cinetPayService.initPayment.mockRejectedValue(new Error('CinetPay init échoué : 600 INVALID_SITE_ID'));
    const cinetPayConfig = {
      eventId: 'ev-1',
      provider: 'CINETPAY',
      isActive: true,
      publicKey: null,
      privateKey: 'enc:apikey',
      webhookSecret: 'enc:hmac-secret',
      config: { siteId: 'site-123' },
    };
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: cinetPayConfig });
    const service = makeService(deps, prisma);

    await expect(service.initPayment(REQUEST_USER, { ticketId: 'tk-1' })).rejects.toThrow(ServiceUnavailableException);

    expect(prisma._tx.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'FAILED' } });
    expect(deps.stockService.releaseStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 1);
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.init.failed',
      'Order',
      'order-1',
      expect.objectContaining({ provider: 'CINETPAY' }),
    );
  });

  it("FEDAPAY : si l'appel externe échoue, annule l'Order + relâche le stock + 503", async () => {
    const deps = makeDeps();
    deps.fedaPayService.initPayment.mockRejectedValue(new Error('network error'));
    const fedaPayConfig = {
      eventId: 'ev-1',
      provider: 'FEDAPAY',
      isActive: true,
      publicKey: 'pub-fp',
      privateKey: 'enc:secretkey',
      webhookSecret: 'enc:whsec',
      config: { environment: 'sandbox' },
    };
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: fedaPayConfig });
    const service = makeService(deps, prisma);

    await expect(service.initPayment(REQUEST_USER, { ticketId: 'tk-1' })).rejects.toThrow(ServiceUnavailableException);

    expect(prisma._tx.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'FAILED' } });
    expect(deps.stockService.releaseStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 1);
  });

  it("503 si aucune config n'est active pour l'événement (quel que soit le provider)", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: null });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(deps.cinetPayService.initPayment).not.toHaveBeenCalled();
  });

  it('404 si le billet est introuvable ou inactif', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ ticket: null });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'unknown' }),
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
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
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
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
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
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse si le stock est épuisé (pré-check)', async () => {
    const deps = makeDeps();
    deps.stockService.checkStockAvailable.mockReturnValue(false);
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuse si aucun provider n'est actif pour l'événement (findFirst({isActive:true}) ne renvoie rien)", async () => {
    const deps = makeDeps();
    // La vraie requête Prisma filtre déjà isActive:true — une config
    // désactivée n'est donc jamais renvoyée par findFirst, simulé ici par null.
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: null });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('propage une race condition de stock perdue (STOCK_RACE_CONDITION)', async () => {
    const deps = makeDeps();
    deps.stockService.decrementStockAtomic.mockResolvedValue(false);
    const prisma = makePrisma({ ticket: ACTIVE_TICKET, providerConfig: PROVIDER_CONFIG });
    const service = makeService(deps, prisma);

    await expect(
      service.initPayment(REQUEST_USER, { ticketId: 'tk-1' }),
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

  it('filtre par eventSlug quand fourni (bouton "Mon ticket" du header événement, 2026-07-13)', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ orders: [] });
    const service = makeService(deps, prisma);

    await service.listOrdersForClient(REQUEST_USER, 'concert-festa-2026');

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: 'user-1', event: { slug: 'concert-festa-2026' } },
      }),
    );
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

describe('PaymentsService.handleCinetPayWebhook()', () => {
  const CINETPAY_CONFIG = {
    eventId: 'ev-1',
    provider: 'CINETPAY',
    isActive: true,
    publicKey: null,
    privateKey: 'enc:apikey',
    webhookSecret: 'enc:hmac-secret',
    config: { siteId: 'site-123' },
  };
  const CINETPAY_ORDER = {
    id: 'order-1',
    clientId: 'user-1',
    eventId: 'ev-1',
    status: 'PENDING',
    totalAmount: 5000,
    currency: 'XOF',
    event: { id: 'ev-1', endDate: new Date(Date.now() + 3600_000) },
    items: [{ id: 'oi-1', ticketId: 'tk-1' }],
  };

  function validPayload(overrides: Partial<Record<string, string>> = {}) {
    const base = {
      cpm_site_id: 'site-123',
      cpm_trans_id: 'order-1',
      cpm_trans_date: '20260713120000',
      cpm_amount: '5000',
      cpm_currency: 'XOF',
      signature: 'sig-abc',
      payment_method: 'MOBILE_MONEY',
      cel_phone_num: '22990000000',
      cpm_phone_prefixe: '229',
      cpm_language: 'fr',
      cpm_version: 'V2',
      cpm_payment_config: 'SINGLE',
      cpm_page_action: 'PAYMENT',
      cpm_custom: '',
      cpm_designation: 'Billet VIP',
      cpm_error_message: '',
      ...overrides,
    };
    return base;
  }

  it("400/401 : rejette (401) si le x-token ne correspond pas au HMAC attendu", async () => {
    const deps = makeDeps();
    // safeEqual() par défaut renvoie true dans makeDeps() (pratique pour les
    // autres tests) — ici on veut la vraie comparaison pour prouver le rejet.
    deps.crypto.safeEqual = vi.fn((a: string, b: string) => a === b);
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG, order: CINETPAY_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleCinetPayWebhook(validPayload() as any, 'wrong-token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(deps.cinetPayService.checkTransaction).not.toHaveBeenCalled();
  });

  it("401 si aucune config CinetPay pour l'événement", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: null, order: CINETPAY_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleCinetPayWebhook(validPayload() as any, 'any-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('audit log + no-op si cpm_trans_id absent', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG });
    const service = makeService(deps, prisma);

    await service.handleCinetPayWebhook({ ...validPayload(), cpm_trans_id: '' } as any, 'any-token');

    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'missing_transaction_id' }),
    );
  });

  it('audit log + no-op si Order introuvable', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG, order: null });
    const service = makeService(deps, prisma);

    await service.handleCinetPayWebhook(validPayload() as any, 'any-token');

    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'order_not_found' }),
    );
  });

  it('succès : signature valide, re-vérification ACCEPTED, montant correct → Order PAID + QR + audit', async () => {
    const deps = makeDeps();
    const payload = validPayload();
    const expectedHmac = computeCinetPayHmac(payload, 'decrypted:enc:hmac-secret');
    deps.cinetPayService.checkTransaction.mockResolvedValue({ status: 'ACCEPTED', amount: 5000, currency: 'XOF' });
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG, order: CINETPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleCinetPayWebhook(payload as any, expectedHmac);

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'PAID', paymentRef: 'order-1' }),
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.success',
      'Order',
      'order-1',
      expect.objectContaining({ transactionId: 'order-1' }),
    );
  });

  it('échec : re-vérification REFUSED → Order FAILED + stock relâché', async () => {
    const deps = makeDeps();
    const payload = validPayload();
    const expectedHmac = computeCinetPayHmac(payload, 'decrypted:enc:hmac-secret');
    deps.cinetPayService.checkTransaction.mockResolvedValue({ status: 'REFUSED', amount: 5000, currency: 'XOF' });
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG, order: CINETPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleCinetPayWebhook(payload as any, expectedHmac);

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(deps.stockService.releaseStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 1);
  });

  it('idempotence : webhook déjà traité → no-op silencieux', async () => {
    const deps = makeDeps();
    deps.webhookIdempotency.recordOrSkip.mockResolvedValue(ALREADY_PROCESSED);
    const payload = validPayload();
    const expectedHmac = computeCinetPayHmac(payload, 'decrypted:enc:hmac-secret');
    const prisma = makePrisma({ providerConfig: CINETPAY_CONFIG, order: CINETPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleCinetPayWebhook(payload as any, expectedHmac);

    expect(deps.cinetPayService.checkTransaction).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.handleFedaPayWebhook()', () => {
  const FEDAPAY_CONFIG = {
    eventId: 'ev-1',
    provider: 'FEDAPAY',
    isActive: true,
    publicKey: 'pub-fp',
    privateKey: 'enc:secretkey',
    webhookSecret: 'enc:whsec',
    config: { environment: 'sandbox' },
  };
  const FEDAPAY_ORDER = {
    id: 'order-1',
    clientId: 'user-1',
    eventId: 'ev-1',
    status: 'PENDING',
    totalAmount: 5000,
    currency: 'XOF',
    paymentRef: '999',
    event: { id: 'ev-1', endDate: new Date(Date.now() + 3600_000) },
    items: [{ id: 'oi-1', ticketId: 'tk-1' }],
  };
  const RAW_BODY = JSON.stringify({ name: 'transaction.approved', object: { id: 999, status: 'approved' } });

  it('401 si le header de signature est absent', async () => {
    const deps = makeDeps();
    const prisma = makePrisma();
    const service = makeService(deps, prisma);

    await expect(service.handleFedaPayWebhook(RAW_BODY, undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('no-op (pas de crash) si le corps JSON est invalide', async () => {
    const deps = makeDeps();
    const prisma = makePrisma();
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook('not-json{{{', 'sig');

    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('audit log si object.id absent du payload', async () => {
    const deps = makeDeps();
    const prisma = makePrisma();
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook(JSON.stringify({ name: 'transaction.approved', object: {} }), 'sig');

    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'missing_transaction_id' }),
    );
  });

  it('audit log si aucune Order ne correspond à ce paymentRef', async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ order: null });
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook(RAW_BODY, 'sig');

    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.failed',
      'Order',
      null,
      expect.objectContaining({ reason: 'order_not_found' }),
    );
  });

  it("401 si aucune config FedaPay pour l'événement", async () => {
    const deps = makeDeps();
    const prisma = makePrisma({ providerConfig: null, order: FEDAPAY_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleFedaPayWebhook(RAW_BODY, 'sig')).rejects.toThrow(UnauthorizedException);
  });

  it('401 si le SDK FedaPay rejette la signature (constructWebhookEvent lève)', async () => {
    const deps = makeDeps();
    deps.fedaPayService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const prisma = makePrisma({ providerConfig: FEDAPAY_CONFIG, order: FEDAPAY_ORDER });
    const service = makeService(deps, prisma);

    await expect(service.handleFedaPayWebhook(RAW_BODY, 'bad-sig')).rejects.toThrow(UnauthorizedException);
    expect(deps.fedaPayService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('succès : signature valide, statut approved, montant correct → Order PAID', async () => {
    const deps = makeDeps();
    deps.fedaPayService.constructWebhookEvent.mockReturnValue({ name: 'transaction.approved', object: { id: 999 } });
    deps.fedaPayService.getTransactionStatus.mockResolvedValue({ status: 'approved', amount: 5000 });
    const prisma = makePrisma({ providerConfig: FEDAPAY_CONFIG, order: FEDAPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook(RAW_BODY, 'sig');

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'PAID', paymentRef: '999' }),
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      'payment.webhook.success',
      'Order',
      'order-1',
      expect.objectContaining({ transactionId: '999' }),
    );
  });

  it('échec : statut declined côté FedaPay → Order FAILED + stock relâché', async () => {
    const deps = makeDeps();
    deps.fedaPayService.constructWebhookEvent.mockReturnValue({ name: 'transaction.declined', object: { id: 999 } });
    deps.fedaPayService.getTransactionStatus.mockResolvedValue({ status: 'declined', amount: 5000 });
    const prisma = makePrisma({ providerConfig: FEDAPAY_CONFIG, order: FEDAPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook(
      JSON.stringify({ name: 'transaction.declined', object: { id: 999 } }),
      'sig',
    );

    expect(prisma._tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(deps.stockService.releaseStockAtomic).toHaveBeenCalledWith(prisma._tx, 'tk-1', 1);
  });

  it('idempotence : webhook déjà traité → no-op silencieux', async () => {
    const deps = makeDeps();
    deps.webhookIdempotency.recordOrSkip.mockResolvedValue(ALREADY_PROCESSED);
    deps.fedaPayService.constructWebhookEvent.mockReturnValue({ name: 'transaction.approved', object: { id: 999 } });
    const prisma = makePrisma({ providerConfig: FEDAPAY_CONFIG, order: FEDAPAY_ORDER });
    const service = makeService(deps, prisma);

    await service.handleFedaPayWebhook(RAW_BODY, 'sig');

    expect(deps.fedaPayService.getTransactionStatus).not.toHaveBeenCalled();
  });
});
