/**
 * Tests unitaires — WebhookIdempotencyService
 * Idempotence des webhooks via contrainte @unique (CDC §8.3).
 *
 * Garantie : un même webhook (provider + transactionId) rejoué ne doit JAMAIS
 * être traité deux fois. Détecté via l'erreur Prisma P2002 (violation d'unicité).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookIdempotencyService, ALREADY_PROCESSED } from './webhook-idempotency.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';

describe('WebhookIdempotencyService — recordOrSkip()', () => {
  let audit: AuditService;
  let createMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
    createMock = vi.fn();
  });

  function makeService() {
    const prisma = { webhookEvent: { create: createMock } } as any;
    return new WebhookIdempotencyService(prisma, audit);
  }

  it('tente d\'enregistrer un nouveau webhook (create)', async () => {
    createMock.mockResolvedValue({ id: 'wh-1' });
    const service = makeService();

    const result = await service.recordOrSkip('KKIAPAY', 'tx-123');

    expect(result).toBe(true); // nouveau → traiter
    expect(createMock).toHaveBeenCalledWith({
      data: { provider: 'KKIAPAY', transactionId: 'tx-123' },
    });
  });

  it('détecte un doublon (P2002) et retourne ALREADY_PROCESSED', async () => {
    // Simule l'erreur Prisma P2002 (violation contrainte unique)
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    createMock.mockRejectedValue(p2002);
    const service = makeService();

    const result = await service.recordOrSkip('KKIAPAY', 'tx-123');

    expect(result).toBe(ALREADY_PROCESSED);
    // Audit du doublon
    expect(audit.log).toHaveBeenCalledWith(
      'payment.webhook.duplicate',
      'Order',
      null,
      { transactionId: 'tx-123', provider: 'KKIAPAY' },
    );
  });

  it('propage les erreurs non-P2002 (vraie erreur BDD)', async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: '5.22.0',
    });
    createMock.mockRejectedValue(otherError);
    const service = makeService();

    await expect(service.recordOrSkip('KKIAPAY', 'tx-123')).rejects.toThrow();
  });

  it('propage les erreurs génériques (réseau, etc.)', async () => {
    createMock.mockRejectedValue(new Error('connection lost'));
    const service = makeService();

    await expect(service.recordOrSkip('KKIAPAY', 'tx-123')).rejects.toThrow(
      'connection lost',
    );
  });

  it('normalise le provider en majuscules', async () => {
    createMock.mockResolvedValue({ id: 'wh-1' });
    const service = makeService();

    await service.recordOrSkip('kkiapay', 'tx-123');

    expect(createMock).toHaveBeenCalledWith({
      data: { provider: 'KKIAPAY', transactionId: 'tx-123' },
    });
  });

  it('rejette un transactionId vide (webhook malformé)', async () => {
    const service = makeService();
    await expect(service.recordOrSkip('KKIAPAY', '')).rejects.toThrow(
      /transactionId/i,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
