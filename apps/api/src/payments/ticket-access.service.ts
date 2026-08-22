import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCodes } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TicketAccessService — le lien qui remplace le tableau de bord (lot 1,
 * 2026-08-22).
 *
 * Un acheteur sans compte n'a nulle part où retourner chercher son billet. Ce
 * lien signé EST son accès : il arrive par email et n'ouvre qu'une chose, la
 * commande qu'il désigne.
 *
 * Un jeton signé plutôt qu'une table de jetons : rien à stocker, rien à
 * nettoyer, et la signature suffit à prouver que le lien vient de nous. Le
 * revers est qu'on ne peut pas révoquer un lien isolément — acceptable pour un
 * billet, qui perd de toute façon sa valeur une fois scanné, et dont le QR est
 * la vraie pièce contrôlée à l'entrée.
 */

/** Ce que porte le jeton. `typ` empêche qu'un JWT de session serve ici. */
interface ChargeUtileBillet {
  orderId: string;
  typ: 'ticket';
}

/**
 * Le lien survit largement à l'événement : les gens retrouvent leur email des
 * semaines plus tard, et un lien mort ne dit rien d'utile à qui cherche sa
 * facture.
 */
const JOURS_APRES_EVENEMENT = 60;

@Injectable()
export class TicketAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Fabrique le jeton d'une commande. L'expiration suit la fin de l'événement,
   * pas la date d'achat : un billet acheté six mois à l'avance doit rester
   * accessible le jour venu.
   */
  async creerJeton(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, event: { select: { endDate: true } } },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Commande introuvable.' });
    }

    const fin = order.event.endDate.getTime() + JOURS_APRES_EVENEMENT * 24 * 60 * 60 * 1000;
    // Un événement déjà passé produirait sinon un jeton expiré à la seconde
    // de sa création — l'acheteur recevrait un lien mort.
    const expiration = Math.max(Math.floor(fin / 1000), Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

    const charge: ChargeUtileBillet = { orderId: order.id, typ: 'ticket' };
    return this.jwt.sign({ ...charge, exp: expiration });
  }

  /**
   * Ouvre un jeton et renvoie la commande. Toute anomalie — signature
   * invalide, jeton expiré, type inattendu, commande disparue — donne la MÊME
   * réponse : un lien qui ne fonctionne pas. Distinguer les cas renseignerait
   * qui cherche à en fabriquer un.
   */
  async lireCommande(token: string) {
    let charge: ChargeUtileBillet;
    try {
      charge = this.jwt.verify<ChargeUtileBillet>(token);
    } catch {
      throw new NotFoundException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Ce lien n’est plus valable. Demandez-en un nouveau depuis votre email de confirmation.',
      });
    }

    if (charge?.typ !== 'ticket' || !charge.orderId) {
      throw new NotFoundException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Ce lien n’est plus valable. Demandez-en un nouveau depuis votre email de confirmation.',
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: charge.orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        paidAt: true,
        event: { select: { title: true, slug: true, startDate: true, venueName: true, city: true } },
        items: {
          select: {
            id: true,
            isScanned: true,
            qrCode: true,
            ticket: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Ce lien n’est plus valable. Demandez-en un nouveau depuis votre email de confirmation.',
      });
    }

    /*
     * Ni l'email ni le nom de l'acheteur ne sortent d'ici. Le lien peut être
     * transféré, retrouvé dans un fil de discussion, ouvert sur un téléphone
     * prêté : il doit montrer le billet, pas l'identité de qui l'a acheté.
     */
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      paidAt: order.paidAt,
      event: {
        title: order.event.title,
        slug: order.event.slug,
        startDate: order.event.startDate,
        venueName: order.event.venueName,
        city: order.event.city,
      },
      items: order.items.map((item) => ({
        id: item.id,
        ticketName: item.ticket.name,
        hasTicket: Boolean(item.qrCode),
        isScanned: item.isScanned,
        qrCode: item.qrCode,
      })),
    };
  }
}
