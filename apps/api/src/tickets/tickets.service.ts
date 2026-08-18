import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ErrorCodes, TicketPolicy } from '@saas-events/types';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';

/** Code d'erreur Prisma — violation de contrainte de clé étrangère. */
const FOREIGN_KEY_VIOLATION = 'P2003';

/**
 * TicketsService — CRUD des types de billets (CDC §6.3).
 *
 * Règle d'or (RULES.md §1) : la sécurité vit dans NestJS, jamais dans Supabase RLS.
 * Chaque opération d'écriture vérifie explicitement l'ownership
 * (event.managerId === user.id) avant de toucher au ticket.
 */
@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwnedEventOrThrow(eventId: string, managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, managerId: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }
    if (event.managerId !== managerId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Vous n'êtes pas le gestionnaire de cet événement.",
      });
    }
    return event;
  }

  private async getOwnedTicketOrThrow(ticketId: string, managerId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { id: true, managerId: true } } },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: ErrorCodes.TICKET_NOT_FOUND,
        message: 'Billet introuvable.',
      });
    }
    if (ticket.event.managerId !== managerId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Vous n'êtes pas le gestionnaire de cet événement.",
      });
    }
    return ticket;
  }

  /** Whitelist d'URL (RULES.md §6) — ne bloque que si une image est réellement fournie. */
  private assertValidDesignImageUrl(designImageUrl: string | undefined): void {
    if (designImageUrl && !isAllowedImageUrl(designImageUrl)) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_URL_INVALID,
        message: "URL d'image non autorisée — utilisez POST /api/storage/upload pour héberger l'image.",
      });
    }
  }

  /**
   * Plafond de capacité (décision produit 2026-08-16) : la somme des `stock`
   * de tous les billets d'un événement ne peut pas dépasser
   * `Event.expectedAttendees`. `null` = aucun plafond, comportement d'avant.
   *
   * On compte les places OFFERTES (`stock`), pas les places vendues : le but
   * est d'empêcher de mettre en vente plus de billets que la salle ne peut en
   * accueillir, pas de réagir une fois la survente constatée.
   *
   * `excludeTicketId` sert aux modifications : le billet en cours d'édition
   * doit sortir de la somme, sinon son propre stock actuel serait compté en
   * plus du nouveau et toute hausse serait refusée à tort.
   */
  private async assertCapacityAllows(
    eventId: string,
    newStock: number,
    excludeTicketId?: string,
  ): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { expectedAttendees: true },
    });
    if (!event?.expectedAttendees) return;

    const aggregate = await this.prisma.ticket.aggregate({
      where: { eventId, id: excludeTicketId ? { not: excludeTicketId } : undefined },
      _sum: { stock: true },
    });
    const others = aggregate._sum.stock ?? 0;

    if (others + newStock > event.expectedAttendees) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_CAPACITY_EXCEEDED,
        message:
          `Capacité dépassée : ${others + newStock} places pour un maximum de ` +
          `${event.expectedAttendees}. Augmentez le nombre de personnes prévues ` +
          `sur l'événement, ou réduisez ce stock.`,
      });
    }
  }

  /**
   * Rattachement d'un billet à une journée (décision produit 2026-08-16).
   *
   * En PER_DAY la journée est obligatoire : un billet sans journée n'ouvrirait
   * rien au contrôle d'accès, le scanner n'ayant aucun jour à comparer.
   * Dans les deux autres régimes elle doit être absente — un billet SINGLE_DAY
   * rattaché à une journée laisserait croire à une restriction que le scanner
   * n'appliquerait pas.
   */
  private async assertTicketDayMatchesPolicy(
    eventId: string,
    eventDayId: string | undefined,
  ): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { ticketPolicy: true },
    });
    const policy = event?.ticketPolicy ?? TicketPolicy.SINGLE_DAY;

    if (policy !== TicketPolicy.PER_DAY) {
      if (eventDayId) {
        throw new BadRequestException({
          code: ErrorCodes.TICKET_DAY_INVALID,
          message:
            "Ce billet ne peut pas être rattaché à une journée : l'événement n'est pas en régime « billet par jour ».",
        });
      }
      return;
    }

    if (!eventDayId) {
      throw new BadRequestException({
        code: ErrorCodes.TICKET_DAY_INVALID,
        message: 'Choisissez la journée ouverte par ce billet.',
      });
    }

    // La journée doit appartenir à CET événement : un id venant d'un autre
    // événement ouvrirait une porte que son organisateur n'a pas ouverte.
    const day = await this.prisma.eventDay.findFirst({
      where: { id: eventDayId, eventId },
      select: { id: true },
    });
    if (!day) {
      throw new BadRequestException({
        code: ErrorCodes.TICKET_DAY_INVALID,
        message: "Cette journée n'appartient pas à votre événement.",
      });
    }
  }

  async createTicket(eventId: string, managerId: string, dto: CreateTicketDto) {
    await this.getOwnedEventOrThrow(eventId, managerId);
    this.assertValidDesignImageUrl(dto.designImageUrl);
    await this.assertCapacityAllows(eventId, dto.stock);
    await this.assertTicketDayMatchesPolicy(eventId, dto.eventDayId);

    return this.prisma.ticket.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        compareAtPrice: dto.compareAtPrice,
        promoEndsAt: dto.promoEndsAt ? new Date(dto.promoEndsAt) : undefined,
        dayLabel: dto.dayLabel,
        eventDayId: dto.eventDayId,
        currency: dto.currency,
        stock: dto.stock,
        maxPerOrder: dto.maxPerOrder,
        category: dto.category,
        features: normalizeFeatures(dto.features),
        saleMode: dto.saleMode,
        requestBadge: dto.requestBadge,
        isActive: dto.isActive,
        saleStartDate: dto.saleStartDate ? new Date(dto.saleStartDate) : undefined,
        saleEndDate: dto.saleEndDate ? new Date(dto.saleEndDate) : undefined,
        designImageUrl: dto.designImageUrl,
        designBgColor: dto.designBgColor,
        designTextColor: dto.designTextColor,
      },
    });
  }

  async listByEvent(eventId: string, managerId: string) {
    await this.getOwnedEventOrThrow(eventId, managerId);
    return this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTicket(ticketId: string, managerId: string) {
    return this.getOwnedTicketOrThrow(ticketId, managerId);
  }

  async updateTicket(ticketId: string, managerId: string, dto: UpdateTicketDto) {
    const ticket = await this.getOwnedTicketOrThrow(ticketId, managerId);
    this.assertValidDesignImageUrl(dto.designImageUrl);
    // Pas de contrôle de capacité ici : `stock` est volontairement absent de
    // UpdateTicketDto (modifier la capacité après des ventes est une décision
    // produit non tranchée, BUSINESS.md §12), la somme ne peut donc pas bouger.

    // Le plafond par commande se fige à la première vente (décision produit
    // 2026-08-18) : les acheteurs suivants ne joueraient plus sous la même
    // règle que les précédents. Même raisonnement que TICKET_POLICY_LOCKED.
    // Renvoyer la MÊME valeur n'est pas une modification — le formulaire
    // réémet tous ses champs, il ne faut pas le punir pour ça.
    if (
      dto.maxPerOrder !== undefined &&
      dto.maxPerOrder !== ticket.maxPerOrder &&
      ticket.stockSold > 0
    ) {
      throw new ConflictException({
        code: ErrorCodes.TICKET_MAX_PER_ORDER_LOCKED,
        message:
          `"${ticket.name}" a déjà ${ticket.stockSold} vente(s) : le nombre de places ` +
          'par commande ne peut plus changer.',
      });
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...dto,
        // `null` efface la date, `undefined` la laisse telle quelle. Le
        // ternaire précédent confondait les deux : une fenêtre de vente posée
        // par erreur ne pouvait plus être retirée (2026-08-18).
        saleStartDate: toNullableDate(dto.saleStartDate),
        saleEndDate: toNullableDate(dto.saleEndDate),
        promoEndsAt: toNullableDate(dto.promoEndsAt),
        features: normalizeFeatures(dto.features),
      },
    });
  }

  async deleteTicket(ticketId: string, managerId: string): Promise<void> {
    await this.getOwnedTicketOrThrow(ticketId, managerId);

    try {
      await this.prisma.ticket.delete({ where: { id: ticketId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === FOREIGN_KEY_VIOLATION
      ) {
        // Des commandes existent déjà pour ce ticket — suppression bloquée par la BDD.
        throw new ConflictException({
          code: 'TICKET_HAS_ORDERS',
          message: 'Impossible de supprimer un billet ayant déjà des commandes. Désactivez-le plutôt.',
        });
      }
      throw err;
    }
  }
}

/**
 * Convertit une date d'entrée en valeur Prisma : `undefined` = champ non
 * transmis (inchangé), `null` = effacement explicite, chaîne = nouvelle date.
 */
function toNullableDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

/**
 * Nettoie la liste de bénéfices (2026-08-18) : les entrées arrivent d'un
 * `<textarea>` ligne à ligne, donc avec des blancs de bord et, presque
 * toujours, une ligne vide finale. Les stocker telles quelles ferait rendre
 * des puces cochées vides sur la page publique.
 *
 * Le plafond du DTO (12 entrées, 80 caractères) est une VALIDATION, pas une
 * garantie : on retronque ici, côté service, parce que c'est lui qui écrit en
 * base — un appel qui contournerait le DTO ne doit pas pouvoir déborder.
 */
function normalizeFeatures(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .map((line) => line.trim().slice(0, 80))
    .filter((line) => line.length > 0)
    .slice(0, 12);
}
