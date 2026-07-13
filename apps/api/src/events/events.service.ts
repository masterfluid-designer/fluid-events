import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ErrorCodes } from '@saas-events/types';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';

/** Code d'erreur Prisma — violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** managerId dérivé du JWT (@CurrentUser), jamais du body — voir CreateEventDto. */
  async createEvent(managerId: string, data: CreateEventDto) {
    try {
      return await this.prisma.event.create({
        data: {
          ...data,
          managerId,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
        },
      });
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

    const { faqs, schedule, speakers, galleryImages, sponsorImages, startDate, endDate, ...rest } = data;

    return this.prisma.event.update({
      where: { id: event.id },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        faqs: faqs as unknown as InputJsonValue | undefined,
        schedule: schedule as unknown as InputJsonValue | undefined,
        speakers: speakers as unknown as InputJsonValue | undefined,
        galleryImages: galleryImages as unknown as InputJsonValue | undefined,
        sponsorImages: sponsorImages as unknown as InputJsonValue | undefined,
      },
    });
  }

  /**
   * Whitelist d'URL (RULES.md §6) — revalidée à l'écriture pour toute image
   * référencée dans le contenu centralisé de l'événement (logo, couverture,
   * photos de speakers, galerie, sponsors), pas seulement au rendu. `@IsUrl`
   * ne garantit qu'une forme d'URL valide, jamais une origine autorisée.
   */
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

  async getEvent(id: string) {
    return this.prisma.event.findUnique({ where: { id } });
  }

  async listEvents() {
    return this.prisma.event.findMany();
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
        // statique si `blocks` est vide (page jamais construite).
        eventPage: { select: { blocks: true } },
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
   * répartition par type de billet, activité par scanner. Calculées à la
   * volée (V1 — pas de table d'agrégats dédiée, `EventAnalytics` non branchée).
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
