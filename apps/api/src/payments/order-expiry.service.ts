import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { StockService } from './stock.service';

/**
 * Délai avant qu'une commande sans paiement soit rendue au stock.
 *
 * Trente minutes, très au-delà de ce que dure une session de paiement chez
 * n'importe lequel des fournisseurs : le widget KkiaPay se ferme bien avant,
 * les pages hébergées CinetPay et FedaPay expirent d'elles-mêmes. Cette marge
 * est délibérée — reprendre une place à quelqu'un qui est encore en train de
 * saisir son code Mobile Money serait bien pire que d'attendre.
 */
const MINUTES_AVANT_EXPIRATION = 30;

/**
 * OrderExpiryService — rend au stock les places que personne n'achètera
 * (2026-09-02).
 *
 * Une commande réserve son stock dès l'initiation du paiement — c'est ce qui
 * empêche deux acheteurs de se disputer la dernière place. Mais rien ne le
 * rendait jamais : un visiteur qui ferme le widget sans payer immobilisait sa
 * place **indéfiniment**.
 *
 * Ce n'était pas théorique. Au 2 septembre, trois commandes du 27 août
 * retenaient 3 places sur 70. Sur une soirée réelle, quelques dizaines
 * d'hésitations suffisent à afficher « complet » sur une salle vide — et
 * l'organisateur n'a aucun moyen de comprendre pourquoi.
 *
 * ⚠️ **Le webhook tardif est le vrai danger de ce chantier**, pas l'expiration
 * elle-même. Une commande expirée dont le paiement finit par aboutir a pris
 * l'argent de quelqu'un sans lui donner de billet. Les webhooks ne peuvent pas
 * la ressusciter en silence — la place a pu être revendue entre-temps — mais
 * ils ne doivent surtout pas l'ignorer sans bruit : ils journalisent désormais
 * une ERREUR, qui remonte dans la supervision.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  /**
   * Toutes les dix minutes plutôt qu'une fois par nuit : une place retenue une
   * journée entière est une place perdue pour la vente du soir.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expirerCommandesAbandonnees(): Promise<number> {
    const limite = new Date(Date.now() - MINUTES_AVANT_EXPIRATION * 60 * 1000);

    const abandonnees = await this.prisma.order.findMany({
      where: { status: 'PENDING', createdAt: { lt: limite } },
      select: {
        id: true,
        eventId: true,
        totalAmount: true,
        items: { select: { ticketId: true } },
      },
    });

    if (abandonnees.length === 0) return 0;

    let rendues = 0;

    for (const commande of abandonnees) {
      try {
        /*
         * Une transaction PAR COMMANDE, et non une pour toutes : si l'une
         * échoue, les autres doivent quand même rendre leur stock. Un lot
         * entier annulé pour une ligne fautive laisserait le problème intact.
         *
         * Le `where` porte le statut : entre la lecture et l'écriture, un
         * webhook a pu confirmer le paiement. Sans cette condition, on
         * rendrait au stock une place déjà vendue.
         */
        const touchees = await this.prisma.$transaction(async (tx) => {
          const maj = await tx.order.updateMany({
            where: { id: commande.id, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          });
          if (maj.count === 0) return 0;

          for (const item of commande.items) {
            await this.stock.releaseStockAtomic(tx, item.ticketId, 1);
          }
          return maj.count;
        });

        if (touchees === 0) {
          this.logger.log(`Commande ${commande.id} confirmée entre-temps — laissée telle quelle.`);
          continue;
        }

        rendues++;
        await this.audit.log('order.expired', 'Order', commande.id, {
          eventId: commande.eventId,
          articles: commande.items.length,
          montant: String(commande.totalAmount),
          minutes: MINUTES_AVANT_EXPIRATION,
        });
      } catch (err) {
        // Une commande qui résiste ne doit pas emporter la passe entière : on
        // la signale et on continue, le prochain passage la reprendra.
        this.logger.error(
          `Expiration impossible pour la commande ${commande.id} : ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    if (rendues > 0) {
      this.logger.log(
        `${rendues} commande(s) abandonnée(s) expirée(s), stock rendu (seuil ${MINUTES_AVANT_EXPIRATION} min).`,
      );
    }

    return rendues;
  }
}
