/**
 * bucketSalesByDay — Agrège des commandes payées en série temporelle
 * quotidienne (CDC Phase 5 — Analytics, décision produit 2026-07-14).
 *
 * Zero-fill : chaque jour de la fenêtre est présent dans le résultat même
 * sans vente, pour un graphique sans trous. Pas de table d'agrégats dédiée
 * en V1 (`EventAnalytics` jamais branché) — calculé à la volée à partir des
 * commandes payées, même approche que `EventsService.getMyEventOverview`.
 */
export interface DailySales {
  /** Format YYYY-MM-DD, UTC */
  date: string;
  revenue: number;
  ticketsSold: number;
}

export function bucketSalesByDay(
  orders: Array<{ paidAt: Date | null; amount: number; itemCount: number }>,
  days: number,
): DailySales[] {
  const buckets = new Map<string, DailySales>();
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    );
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, revenue: 0, ticketsSold: 0 });
  }

  for (const order of orders) {
    if (!order.paidAt) continue;
    const key = order.paidAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue; // en dehors de la fenêtre — ignoré silencieusement
    bucket.revenue += order.amount;
    bucket.ticketsSold += order.itemCount;
  }

  return Array.from(buckets.values());
}
