import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';
import { RecoverTicketsDto } from './dto/recover-tickets.dto';

/**
 * TicketRecoveryService — "J'ai perdu mes billets" en libre-service.
 *
 * Pas de login requis (l'achat, lui, reste derrière OAuth — décision produit,
 * cf. plan) : juste le numéro de commande (cuid, confidentiel — connu
 * seulement de l'acheteur via l'email de confirmation) + l'email utilisé à
 * l'achat, revalidés l'un contre l'autre.
 *
 * ⚠️ Réponse TOUJOURS identique côté contrôleur, que la commande existe ou
 * que l'email corresponde ou non — pas d'énumération de commandes (RULES.md).
 */
@Injectable()
export class TicketRecoveryService {
  private readonly logger = new Logger(TicketRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  async recoverTickets(dto: RecoverTicketsDto): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        client: { select: { email: true, name: true } },
        event: { select: { title: true } },
        items: { select: { qrCodeUrl: true, ticket: { select: { name: true } } } },
      },
    });

    const matches =
      order != null &&
      order.status === 'PAID' &&
      order.client.email.toLowerCase() === dto.email.trim().toLowerCase();

    if (matches) {
      const items = order.items
        .filter((item) => item.qrCodeUrl)
        .map((item) => ({ ticketName: item.ticket.name, qrCodeUrl: item.qrCodeUrl! }));

      if (items.length > 0) {
        await this.emailService.sendTicketReadyEmail({
          to: order.client.email,
          clientName: order.client.name ?? '',
          eventTitle: order.event.title,
          orderNumber: order.orderNumber,
          items,
        });
      } else {
        // Commande payée mais PDF pas encore généré (job async en cours) —
        // rien à renvoyer pour l'instant, pas une erreur côté utilisateur.
        this.logger.debug(`Récupération demandée pour commande ${order.orderNumber} — PDF pas encore prêt.`);
      }
    }

    // Toujours logué, succès ou non — mais jamais exposé au client (le
    // contrôleur renvoie une réponse identique dans tous les cas).
    await this.audit.log('ticket.recovery.requested', 'Order', matches ? order!.id : null, {
      orderNumber: dto.orderNumber,
      matched: matches,
    });
  }
}
