import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventDayDto } from './dto/event-config.dto';
import { ErrorCodes, TicketPolicy } from '@saas-events/types';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';
import { bucketSalesByDay } from '../common/analytics.util';
import { AuditService } from '../common/audit.service';

/** Fenêtre de la série temporelle "ventes dans le temps" (Analytics, 2026-07-14). */
const SALES_TREND_DAYS = 30;

/** Code d'erreur Prisma — violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** managerId dérivé du JWT (@CurrentUser), jamais du body — voir CreateEventDto. */
  async createEvent(managerId: string, data: CreateEventDto) {
    try {
      const event = await this.prisma.event.create({
        data: {
          ...data,
          managerId,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        },
      });
      await this.audit.log('event.created', 'Event', event.id, { slug: event.slug }, managerId);
      return event;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        // Contrainte V1 : 1 Manager = 1 Event (Event.managerId @unique).
        throw new ConflictException({
          code: 'EVENT_ALREADY_EXISTS',
          message: 'Vous avez déjà un événement associé à votre compte.',
        });
      }
      throw err;
    }
  }

  /** Mise à jour de l'événement du manager authentifié (ownership implicite via managerId). */
  async updateMyEvent(managerId: string, data: UpdateEventDto) {
    const event = await this.prisma.event.findUnique({
      where: { managerId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }

    this.assertImagesAllowed(data);

    const {
      faqs,
      schedule,
      speakers,
      galleryImages,
      sponsorImages,
      startDate,
      endDate,
      days,
      ticketPolicy,
      ...rest
    } = data;

    // Avant l’écriture : un régime refusé ne doit laisser aucune trace.
    await this.applyDaysAndPolicy(event.id, managerId, ticketPolicy, days);

    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: {
        ...rest,
        ticketPolicy,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        faqs: faqs as unknown as InputJsonValue | undefined,
        schedule: schedule as unknown as InputJsonValue | undefined,
        speakers: speakers as unknown as InputJsonValue | undefined,
        galleryImages: galleryImages as unknown as InputJsonValue | undefined,
        sponsorImages: sponsorImages as unknown as InputJsonValue | undefined,
      },
    });
    await this.audit.log('event.updated', 'Event', updated.id, { fields: Object.keys(rest) }, managerId);
    return updated;
  }

  /**
   * Whitelist d'URL (RULES.md §6) — revalidée à l'écriture pour toute image
   * référencée dans le contenu centralisé de l'événement (logo, couverture,
   * photos de speakers, galerie, sponsors), pas seulement au rendu. `@IsUrl`
   * ne garantit qu'une forme d'URL valide, jamais une origine autorisée.
   */
  /**
   * Applique le régime de billetterie et la liste des journées (décision
   * produit 2026-08-16). Trois garde-fous, dans cet ordre :
   *
   *  1. Quitter SINGLE_DAY exige le palier Premium. Le frontend masque déjà
   *     l'option, mais un PATCH direct doit être refusé — RULES.md §1 : la
   *     décision vit dans NestJS, jamais dans le client.
   *  2. La liste doit être cohérente avec le régime : aucune journée en
   *     SINGLE_DAY, au moins deux sinon (une seule journée, c'est SINGLE_DAY).
   *  3. Une journée à laquelle des billets sont rattachés ne peut pas
   *     disparaître. `Ticket.eventDayId` est en `SetNull` : la supprimer
   *     détacherait silencieusement des billets déjà vendus, qui n'ouvriraient
   *     plus aucune journée au contrôle d'accès.
   */
  private async applyDaysAndPolicy(
    eventId: string,
    managerId: string,
    ticketPolicy: TicketPolicy | undefined,
    days: EventDayDto[] | undefined,
  ): Promise<void> {
    if (ticketPolicy === undefined && days === undefined) return;

    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { isPremium: true },
    });
    const current = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { ticketPolicy: true },
    });
    const effectivePolicy = ticketPolicy ?? current?.ticketPolicy ?? TicketPolicy.SINGLE_DAY;
    const wantsMultiDay = effectivePolicy !== TicketPolicy.SINGLE_DAY || (days?.length ?? 0) > 0;

    if (wantsMultiDay && !manager?.isPremium) {
      throw new ForbiddenException({
        code: ErrorCodes.PREMIUM_REQUIRED,
        message:
          'Les événements sur plusieurs jours sont réservés au palier Premium. Contactez un administrateur.',
      });
    }

    const nextDays = days ?? [];
    if (effectivePolicy === TicketPolicy.SINGLE_DAY && nextDays.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_DAYS_INVALID,
        message: "Un événement d'une seule journée ne peut pas déclarer de journées.",
      });
    }
    if (effectivePolicy !== TicketPolicy.SINGLE_DAY && nextDays.length < 2) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_DAYS_INVALID,
        message: 'Déclarez au moins deux journées, ou repassez en événement d’une seule journée.',
      });
    }

    // Les dates arrivent en ISO ; on ne garde que la date civile — le scanner
    // compare un jour du calendrier, jamais un instant.
    const normalized = nextDays.map((d, index) => ({
      label: d.label,
      date: new Date(`${d.date.slice(0, 10)}T00:00:00.000Z`),
      order: d.order ?? index,
    }));
    const keys = new Set(normalized.map((d) => d.date.toISOString()));
    if (keys.size !== normalized.length) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_DAYS_INVALID,
        message: 'Deux journées ne peuvent pas tomber à la même date.',
      });
    }

    const existing = await this.prisma.eventDay.findMany({
      where: { eventId },
      select: { id: true, date: true, _count: { select: { tickets: true } } },
    });
    const doomed = existing.filter(
      (d) => !keys.has(d.date.toISOString()) && d._count.tickets > 0,
    );
    if (doomed.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_DAYS_INVALID,
        message:
          'Une journée à laquelle des billets sont rattachés ne peut pas être supprimée. Retirez d’abord ces billets.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Remplacement en bloc, mais les journées conservées gardent leur `id` :
      // les billets qui les référencent ne doivent pas être détachés.
      await tx.eventDay.deleteMany({
        where: { eventId, date: { notIn: normalized.map((d) => d.date) } },
      });
      for (const day of normalized) {
        await tx.eventDay.upsert({
          where: { eventId_date: { eventId, date: day.date } },
          create: { eventId, ...day },
          update: { label: day.label, order: day.order },
        });
      }
    });
  }

  private assertImagesAllowed(data: UpdateEventDto) {
    const urls = [
      data.logoUrl,
      data.coverImageUrl,
      ...(data.speakers?.map((s) => s.photoUrl) ?? []),
      ...(data.galleryImages?.map((m) => m.url) ?? []),
      ...(data.sponsorImages?.map((m) => m.url) ?? []),
    ].filter((url): url is string => typeof url === 'string' && url.length > 0);

    for (const url of urls) {
      if (!isAllowedImageUrl(url)) {
        throw new BadRequestException({
          code: ErrorCodes.DESIGN_IMAGE_URL_INVALID,
          message: `URL d'image non autorisée : ${url} — utilisez POST /api/storage/upload.`,
        });
      }
    }
  }

  /**
   * Page événement publique (CDC §6.2 GET /api/events/:slug/public) —
   * accessible sans authentification, uniquement si l'événement est publié.
   */
  async getPublicEventBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        tickets: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
        },
        // Blocs Builder (CDC §11) — le frontend retombe sur le template
        // statique si `blocks` est vide (page jamais construite). `theme`
        // porte la personnalisation (police/couleurs) de l'organisateur.
        eventPage: { select: { blocks: true, theme: true } },
      },
    });

    if (!event || event.status !== 'PUBLISHED') {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  /** Événement du manager authentifié (CDC §1.4 : 1 Manager = 1 Event). */
  async getMyEvent(managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { managerId },
      include: { tickets: { orderBy: { createdAt: 'asc' } } },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }
    return event;
  }

  /**
   * Statistiques réelles de l'événement du manager : revenus, billets vendus,
   * répartition par type de billet, activité par scanner, tendance des
   * ventes sur 30 jours et taux de remplissage par type de billet (Analytics,
   * décision produit 2026-07-14). Calculées à la volée (V1 — pas de table
   * d'agrégats dédiée, `EventAnalytics` non branchée).
   */
  async getMyEventOverview(managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { managerId },
      include: {
        scanners: { include: { logs: { select: { result: true, scannedAt: true } } } },
        // Statut paiement (décision produit 2026-07-13, config par événement,
        // supersède BUSINESS.md §6) — le manager ne voit qu'un statut actif/
        // inactif, jamais les identifiants (RULES.md §9).
        paymentProviderConfigs: { where: { isActive: true }, select: { provider: true } },
        tickets: { select: { name: true, stock: true, stockSold: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }

    const paidOrders = await this.prisma.order.findMany({
      where: { eventId: event.id, status: 'PAID' },
      select: {
        paidAt: true,
        items: { select: { unitPrice: true, ticketId: true, ticket: { select: { name: true } } } },
      },
    });

    let totalRevenue = 0;
    let ticketsSold = 0;
    const revenueByTicket = new Map<string, { name: string; revenue: number; count: number }>();

    for (const order of paidOrders) {
      for (const item of order.items) {
        const amount = Number(item.unitPrice);
        totalRevenue += amount;
        ticketsSold += 1;
        const entry = revenueByTicket.get(item.ticketId) ?? {
          name: item.ticket.name,
          revenue: 0,
          count: 0,
        };
        entry.revenue += amount;
        entry.count += 1;
        revenueByTicket.set(item.ticketId, entry);
      }
    }

    const salesOverTime = bucketSalesByDay(
      paidOrders.map((order) => ({
        paidAt: order.paidAt,
        amount: order.items.reduce((sum, item) => sum + Number(item.unitPrice), 0),
        itemCount: order.items.length,
      })),
      SALES_TREND_DAYS,
    );

    const fillRateByTicketType = event.tickets.map((t) => ({
      name: t.name,
      stock: t.stock,
      stockSold: t.stockSold,
      fillRate: t.stock > 0 ? Math.round((t.stockSold / t.stock) * 100) : 0,
    }));

    const scansByScanner = event.scanners.map((scanner) => {
      const validLogs = scanner.logs.filter((log) => log.result === 'VALID');
      const lastScanAt = validLogs.reduce<Date | null>(
        (latest, log) => (!latest || log.scannedAt > latest ? log.scannedAt : latest),
        null,
      );
      return { name: scanner.name, scans: validLogs.length, lastScanAt };
    });

    return {
      event: { id: event.id, title: event.title, slug: event.slug, status: event.status },
      totalRevenue,
      currency: 'XOF',
      ticketsSold,
      revenueByTicketType: Array.from(revenueByTicket.values()),
      salesOverTime,
      fillRateByTicketType,
      scansByScanner,
      paymentStatus: {
        configured: event.paymentProviderConfigs.length > 0,
        provider: event.paymentProviderConfigs[0]?.provider ?? null,
      },
    };
  }

  /** Liste des participants (billets payés) de l'événement — ownership Manager vérifiée. */
  async getParticipants(eventId: string, managerId: string) {
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

    const orders = await this.prisma.order.findMany({
      where: { eventId, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      select: {
        orderNumber: true,
        paidAt: true,
        client: { select: { name: true, email: true } },
        items: { select: { isScanned: true, ticket: { select: { name: true } } } },
      },
    });

    return orders.flatMap((order) =>
      order.items.map((item) => ({
        orderNumber: order.orderNumber,
        clientName: order.client.name ?? 'Client',
        clientEmail: order.client.email,
        ticketName: item.ticket.name,
        purchasedAt: order.paidAt,
        isScanned: item.isScanned,
      })),
    );
  }
}
