/**
 * Tests unitaires — StockService
 * Décrément atomique du stock avec garde de capacité (CDC §8.3 — race condition).
 *
 * La garantie fondamentale : on ne peut JAMAIS vendre plus de billets que `stock`.
 * Testé via simulation concurrente : N acheteurs pour un stock < N.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StockService } from './stock.service';

/**
 * Simulateur de transaction en mémoire reproduisant le comportement de
 * Prisma `updateMany` avec la garde de capacité (CDC §8.3).
 *
 * updateMany(where: { id, stockSold: { lte: stock - qty } }, data: { stockSold: increment })
 * → retourne { count: 0 } si la condition échoue, { count: 1 } sinon.
 *
 * Toutes les opérations sont synchrones mais wrapped en Promise pour coller
 * au contrat async de Prisma. Important : PAS d'await interne avant la mutation,
 * de façon à exposer toute race condition dans la logique testée.
 */
function makeInMemoryTx(initialSold = 0, stock = 100) {
  const state = { stockSold: initialSold, stock };
  const tx = {
    ticket: {
      updateMany(args: {
        where: { id: string; stockSold?: { lte: number } };
        data: { stockSold: { increment: number } };
      }): Promise<{ count: number }> {
        const qty = args.data.stockSold.increment;
        const limit = args.where.stockSold?.lte;
        // Garde de capacité : stockSold doit être <= (stock - qty)
        const allowed = limit !== undefined ? state.stockSold <= limit : true;
        if (!allowed) return Promise.resolve({ count: 0 });
        state.stockSold += qty;
        return Promise.resolve({ count: 1 });
      },
    },
  };
  return {
    state,
    tx,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
}

describe('StockService — decrementStockAtomic()', () => {
  let stockService: StockService;

  beforeEach(() => {
    stockService = new StockService();
  });

  it('décrémente le stock avec succès quand la capacité le permet', async () => {
    const sim = makeInMemoryTx(0, 100);
    const result = await stockService.decrementStockAtomic(sim.tx, 'ticket-1', 100, 1);
    expect(result).toBe(true);
    expect(sim.state.stockSold).toBe(1);
  });

  it('retourne false (et ne décrémente pas) quand le stock est épuisé', async () => {
    const sim = makeInMemoryTx(5, 5); // tout vendu
    const result = await stockService.decrementStockAtomic(sim.tx, 'ticket-1', 5, 1);
    expect(result).toBe(false);
    expect(sim.state.stockSold).toBe(5); // inchangé
  });

  it('passe la bonne condition where (garde de capacité)', async () => {
    const sim = makeInMemoryTx(0, 100);
    // Espionne updateMany pour vérifier les args
    const spy = (sim.tx.ticket.updateMany = sim.tx.ticket.updateMany.bind(sim.tx.ticket));
    const callSpy = vi.fn(spy);
    sim.tx.ticket.updateMany = callSpy as any;

    await stockService.decrementStockAtomic(sim.tx, 'ticket-1', 100, 1);

    expect(callSpy).toHaveBeenCalledWith({
      where: { id: 'ticket-1', stockSold: { lte: 99 } }, // stock - qty = 100 - 1
      data: { stockSold: { increment: 1 } },
    });
  });

  it('gère une quantité > 1 (vente groupée future)', async () => {
    const sim = makeInMemoryTx(0, 10);
    const result = await stockService.decrementStockAtomic(sim.tx, 'ticket-1', 10, 3);
    expect(result).toBe(true);
    expect(sim.state.stockSold).toBe(3);
  });

  it('refuse une quantité > 1 qui dépasserait la capacité', async () => {
    const sim = makeInMemoryTx(8, 10); // 8 vendus, reste 2
    const result = await stockService.decrementStockAtomic(sim.tx, 'ticket-1', 10, 3);
    expect(result).toBe(false);
    expect(sim.state.stockSold).toBe(8); // inchangé
  });

  // ─── Simulation concurrente (le vrai test de la race condition) ───────────
  it('ne dépasse jamais la capacité sous forte concurrence', async () => {
    const stock = 10;
    const sim = makeInMemoryTx(0, stock);

    // 50 acheteurs concurrents pour 10 billets
    const buyers = Array.from({ length: 50 }, () =>
      stockService.decrementStockAtomic(sim.tx, 'ticket-1', stock, 1),
    );
    const results = await Promise.all(buyers);

    const successCount = results.filter(Boolean).length;
    // Note: le simulateur JS single-threaded résout chaque Promise de façon
    // séquentielle, donc ici on valide la LOGIQUE de la garde de capacité.
    // La garantie d'atomicité réelle en production vient du verrou ligne PostgreSQL.
    expect(successCount).toBe(stock);
    expect(sim.state.stockSold).toBe(stock);
    expect(successCount).toBeLessThanOrEqual(stock);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('StockService — checkStockAvailable()', () => {
  let stockService: StockService;
  beforeEach(() => {
    stockService = new StockService();
  });

  it('retourne true si du stock est disponible', () => {
    expect(stockService.checkStockAvailable({ stock: 100, stockSold: 50 })).toBe(true);
  });

  it('retourne false si le stock est exactement épuisé', () => {
    expect(stockService.checkStockAvailable({ stock: 100, stockSold: 100 })).toBe(false);
  });

  it('retourne false si le stock est dépassé (anomalie)', () => {
    expect(stockService.checkStockAvailable({ stock: 100, stockSold: 101 })).toBe(false);
  });

  it('retourne true si stockSold = 0 (ouverture des ventes)', () => {
    expect(stockService.checkStockAvailable({ stock: 50, stockSold: 0 })).toBe(true);
  });
});
