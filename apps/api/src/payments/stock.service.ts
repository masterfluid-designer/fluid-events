import { Injectable, Logger } from '@nestjs/common';

/**
 * StockService — Logique de décrément atomique du stock de billets.
 *
 * Mitigation de la race condition la plus critique du CDC (§8.3, audit v2.0.0 🔴).
 *
 * Principe : `updateMany` avec une condition WHERE sur `stockSold`.
 *  - Si `stockSold + quantity <= stock` → la ligne correspond → count = 1 → succès.
 *  - Sinon (stock épuisé) → la ligne ne correspond pas → count = 0 → échec.
 *
 * Cette approche tire parti de l'atomicité ligne de PostgreSQL : deux transactions
 * concurrentes ne peuvent pas toutes deux incrémenter le même stock au-delà de
 * la capacité, car l'une verra `stockSold` avoir changé et sa condition échouera.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  /**
   * Vérifie préventement (avant initiation paiement) si du stock est disponible.
   * Garde d'entrée — la vraie garantie reste le décrément atomique côté webhook.
   */
  checkStockAvailable(ticket: { stock: number; stockSold: number }): boolean {
    return ticket.stockSold < ticket.stock;
  }

  /**
   * Décrémente atomiquement le stock, avec garde de capacité.
   *
   * @param tx Transaction Prisma active (doit être passée par le caller dans $transaction)
   * @param ticketId ID du billet
   * @param stock Capacité totale du billet (lue avant la transaction)
   * @param quantity Quantité à décrémenter (V1 = toujours 1)
   * @returns true si décrémenté, false si stock épuisé (race condition)
   *
   * ⚠️ `tx` doit être le client Prisma de la transaction (pas this.prisma),
   *    sinon la garantie d'atomicité est perdue.
   */
  async decrementStockAtomic(
    tx: {
      ticket: {
        updateMany: (args: {
          where: { id: string; stockSold?: { lte: number } };
          data: { stockSold: { increment: number } };
        }) => Promise<{ count: number }>;
      };
    },
    ticketId: string,
    stock: number,
    quantity: number,
  ): Promise<boolean> {
    // Condition : stockSold <= stock - quantity  ⟺  stockSold + quantity <= stock
    const maxAllowedSold = stock - quantity;

    const updated = await tx.ticket.updateMany({
      where: {
        id: ticketId,
        stockSold: { lte: maxAllowedSold },
      },
      data: { stockSold: { increment: quantity } },
    });

    const success = updated.count > 0;
    if (!success) {
      this.logger.warn(
        `Race condition stock détectée — ticket ${ticketId} épuisé (capacité ${stock})`,
      );
    }
    return success;
  }

  /**
   * Libère le stock précédemment réservé (webhook paiement en échec, CDC §8).
   *
   * Symétrique de `decrementStockAtomic` : une réservation faite à l'init du
   * paiement (avant confirmation provider) doit être annulée si le paiement
   * échoue, sinon le stock reste bloqué indéfiniment sur des commandes mortes.
   *
   * @param tx Transaction Prisma active
   * @param ticketId ID du billet
   * @param quantity Quantité à relâcher (doit correspondre à la réservation initiale)
   */
  async releaseStockAtomic(
    tx: {
      ticket: {
        updateMany: (args: {
          where: { id: string };
          data: { stockSold: { decrement: number } };
        }) => Promise<{ count: number }>;
      };
    },
    ticketId: string,
    quantity: number,
  ): Promise<void> {
    await tx.ticket.updateMany({
      where: { id: ticketId },
      data: { stockSold: { decrement: quantity } },
    });
    this.logger.debug(`Stock relâché — ticket ${ticketId}, quantité ${quantity}.`);
  }
}
