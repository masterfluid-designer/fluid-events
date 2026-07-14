import { describe, it, expect } from 'vitest';
import { bucketSalesByDay } from './analytics.util';

describe('bucketSalesByDay()', () => {
  it('zero-fill : renvoie un bucket par jour de la fenêtre même sans vente', () => {
    const result = bucketSalesByDay([], 7);
    expect(result).toHaveLength(7);
    expect(result.every((b) => b.revenue === 0 && b.ticketsSold === 0)).toBe(true);
  });

  it('les buckets sont triés du plus ancien au plus récent, se terminant aujourd\'hui', () => {
    const result = bucketSalesByDay([], 3);
    const today = new Date().toISOString().slice(0, 10);
    expect(result[2].date).toBe(today);
    expect(new Date(result[0].date).getTime()).toBeLessThan(new Date(result[2].date).getTime());
  });

  it('agrège plusieurs commandes payées le même jour', () => {
    const today = new Date();
    const result = bucketSalesByDay(
      [
        { paidAt: today, amount: 5000, itemCount: 1 },
        { paidAt: today, amount: 3000, itemCount: 2 },
      ],
      1,
    );
    expect(result).toEqual([
      { date: today.toISOString().slice(0, 10), revenue: 8000, ticketsSold: 3 },
    ]);
  });

  it('ignore silencieusement les commandes hors fenêtre', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 jours
    const result = bucketSalesByDay([{ paidAt: oldDate, amount: 5000, itemCount: 1 }], 30);
    expect(result.reduce((sum, b) => sum + b.revenue, 0)).toBe(0);
  });

  it('ignore les commandes sans paidAt (jamais confirmées)', () => {
    const result = bucketSalesByDay([{ paidAt: null, amount: 5000, itemCount: 1 }], 7);
    expect(result.reduce((sum, b) => sum + b.revenue, 0)).toBe(0);
  });
});
