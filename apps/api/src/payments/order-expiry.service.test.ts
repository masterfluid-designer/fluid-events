/**
 * Tests — expiration des commandes abandonnées (2026-09-02).
 *
 * Ce que ces tests gardent n'est pas l'expiration elle-même, qui est simple,
 * mais les deux façons de la rater : rendre au stock une place déjà vendue,
 * et laisser une commande fautive emporter tout le lot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderExpiryService } from './order-expiry.service';

function makePrisma() {
  const tx = {
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    tx,
    order: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

function commande(id: string, articles = 1) {
  return {
    id,
    eventId: 'evt-1',
    totalAmount: 15000,
    items: Array.from({ length: articles }, (_, i) => ({ ticketId: `tk-${i}` })),
  };
}

describe('OrderExpiryService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let stock: { releaseStockAtomic: ReturnType<typeof vi.fn> };
  let service: OrderExpiryService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    stock = { releaseStockAtomic: vi.fn().mockResolvedValue(undefined) };
    service = new OrderExpiryService(prisma as never, audit as never, stock as never);
  });

  it('ne cherche que les PENDING plus vieilles que le seuil', async () => {
    const avant = Date.now();

    await service.expirerCommandesAbandonnees();

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    const seuil = where.createdAt.lt as Date;
    const minutes = (avant - seuil.getTime()) / 60000;
    expect(minutes).toBeGreaterThanOrEqual(29.9);
    expect(minutes).toBeLessThan(31);
  });

  it('ne fait rien quand aucune commande n’a été abandonnée', async () => {
    const n = await service.expirerCommandesAbandonnees();

    expect(n).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('expire et rend une place par article', async () => {
    prisma.order.findMany.mockResolvedValue([commande('o-1', 3)]);

    const n = await service.expirerCommandesAbandonnees();

    expect(n).toBe(1);
    expect(stock.releaseStockAtomic).toHaveBeenCalledTimes(3);
    expect(prisma.tx.order.updateMany.mock.calls[0][0].data).toEqual({ status: 'EXPIRED' });
  });

  /*
   * LE test de ce fichier. Entre la lecture et l'écriture, un webhook a pu
   * confirmer le paiement : sans la condition de statut dans le `where`, on
   * rendrait au stock une place déjà vendue, et deux personnes se
   * présenteraient à la porte avec le même siège.
   */
  it('porte le statut dans le `where` de mise à jour, pas seulement dans la lecture', async () => {
    prisma.order.findMany.mockResolvedValue([commande('o-1')]);

    await service.expirerCommandesAbandonnees();

    expect(prisma.tx.order.updateMany.mock.calls[0][0].where).toEqual({
      id: 'o-1',
      status: 'PENDING',
    });
  });

  it('ne rend rien quand la commande a été confirmée entre-temps', async () => {
    prisma.order.findMany.mockResolvedValue([commande('o-1')]);
    prisma.tx.order.updateMany.mockResolvedValue({ count: 0 });

    const n = await service.expirerCommandesAbandonnees();

    expect(n).toBe(0);
    expect(stock.releaseStockAtomic).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  /*
   * Une transaction par commande : un lot entier annulé pour une ligne fautive
   * laisserait le problème intact, et la place resterait immobilisée.
   */
  it('poursuit le lot quand une commande échoue', async () => {
    prisma.order.findMany.mockResolvedValue([commande('o-1'), commande('o-2'), commande('o-3')]);
    prisma.$transaction
      .mockImplementationOnce(async (fn) => fn(prisma.tx))
      .mockRejectedValueOnce(new Error('verrou'))
      .mockImplementationOnce(async (fn) => fn(prisma.tx));

    const n = await service.expirerCommandesAbandonnees();

    expect(n).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('journalise chaque expiration avec de quoi la comprendre', async () => {
    prisma.order.findMany.mockResolvedValue([commande('o-1', 2)]);

    await service.expirerCommandesAbandonnees();

    expect(audit.log).toHaveBeenCalledWith(
      'order.expired',
      'Order',
      'o-1',
      expect.objectContaining({ eventId: 'evt-1', articles: 2, minutes: 30 }),
    );
  });
});
