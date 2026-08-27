import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentConfigService } from '../payments/payment-config.service';
import { Prisma } from '@prisma/client';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventDayDto } from './dto/event-config.dto';
import { EventAccessMode, ErrorCodes, TicketPolicy, limitesDuPlan } from '@saas-events/types';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';
import { bucketSalesByDay } from '../common/analytics.util';
import { AuditService } from '../common/audit.service';
import { EventAccessService } from '../common/event-access.service';

/** Fenêtre de la série temporelle "ventes dans le temps" (Analytics, 2026-07-14). */
const SALES_TREND_DAYS = 30;

/** Code d'erreur Prisma — violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acces: EventAccessService,
      private readonly paiements: PaymentConfigService,
  ) {}

  /**
   * managerId dérivé du JWT (@CurrentUser), jamais du body — voir CreateEventDto.
   *
   * Le plafond n'est plus la contrainte d'unicité du schéma mais le palier
   * d'abonnement (2026-08-21) : un manager FREE reste à un événement, un
   * PREMIUM va jusqu’à huit. Le contrôle précède la création — attendre le
   * refus de la base ne dirait plus rien depuis que le `@unique` a sauté.
   */
  async createEvent(managerId: string, data: CreateEventDto) {
    await this.acces.assertQuotaEvenements(managerId);

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

      /*
       * L'événement hérite des moyens d'encaissement marqués « à tous mes
       * événements » (2026-08-24). Sans cela, « appliquer à tous » ne
       * vaudrait que pour ceux existant à l'instant du clic, et le
       * neuvième événement d’un organisateur Premium naîtrait muet.
       *
       * Best-effort : le service avale ses propres échecs. Refuser une
       * soirée pour une histoire de clés recopiées serait absurde, et
       * « Mes événements » signale déjà un événement publié sans
       * encaissement.
       */
      await this.paiements.heriterDesConfigsGlobales(managerId, event.id);

      return event;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        // Depuis le retrait du `@unique` sur managerId (2026-08-21), la seule
        // unicité que la création puisse violer est celle du slug — deux
        // événements ne peuvent pas partager la même adresse publique.
        throw new ConflictException({
          code: 'EVENT_ALREADY_EXISTS',
          message: 'Cette adresse (slug) est déjà utilisée par un autre événement.',
        });
      }
      throw err;
    }
  }

  /**
   * Mise à jour d'un événement du manager authentifié.
   *
   * `eventId` absent = compatibilité `/mine`, qui ne vaut que pour un manager
   * mono-événement. Avec plusieurs, le helper refuse plutôt que de deviner.
   */
  async updateMyEvent(managerId: string, data: UpdateEventDto, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);
    const event = { id };

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
      accessMode,
      ...rest
    } = data;

    /*
     * Le régime d'accès sort du lot : il ne s'écrit pas avec les autres
     * champs (2026-08-21). Retirer la billetterie à un événement dont des
     * places ont été payées n'est pas rattrapable, et chaque passage doit
     * laisser une trace. `changerRegimeAcces` porte les deux règles.
     */
    if (accessMode !== undefined) {
      await this.acces.changerRegimeAcces(event.id, accessMode, managerId);
    }

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
      select: { plan: true },
    });
    const current = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { ticketPolicy: true },
    });
    const effectivePolicy = ticketPolicy ?? current?.ticketPolicy ?? TicketPolicy.SINGLE_DAY;
    const wantsMultiDay = effectivePolicy !== TicketPolicy.SINGLE_DAY || (days?.length ?? 0) > 0;

    // Le multi-jours était le SEUL privilège que portait `isPremium`. Il
    // découle désormais du palier, comme les autres (2026-08-21).
    if (wantsMultiDay && !limitesDuPlan(manager?.plan).multiJours) {
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

    // Changer de régime remet la billetterie à zéro (décision produit
    // 2026-08-17) : des billets pensés pour « un billet par jour » n'ont
    // aucun sens en « pass », et l'inverse non plus. Mieux vaut repartir
    // propre que laisser un mélange que le scanner interpréterait mal.
    //
    // MAIS jamais si une seule vente existe : supprimer un billet vendu
    // détruirait la commande qui le référence — la base le refuse déjà par
    // clé étrangère, on préfère un message clair à une erreur brute.
    const policyChanged =
      ticketPolicy !== undefined && current != null && ticketPolicy !== current.ticketPolicy;

    if (policyChanged) {
      const sold = await this.prisma.orderItem.count({ where: { ticket: { eventId } } });
      if (sold > 0) {
        throw new ConflictException({
          code: ErrorCodes.TICKET_POLICY_LOCKED,
          message:
            'Des billets ont déjà été vendus : le déroulement de l’événement ne peut plus être changé.',
        });
      }
    }

    // Les dates arrivent en ISO ; on ne garde que la date civile — le scanner
    // compare un jour du calendrier, jamais un instant.
    const normalized = nextDays.map((d, index) => ({
      label: d.label,
      date: new Date(`${d.date.slice(0, 10)}T00:00:00.000Z`),
      // Lieu et horaires par journée (2026-08-18). Une chaîne vide vaut
      // « pas de valeur » et non « valeur vide » : le formulaire envoie
      // toujours les trois champs, c'est ici qu'on décide qu'ils sont absents.
      location: d.location?.trim() || null,
      startTime: d.startTime || null,
      endTime: d.endTime || null,
      // `null` explicite : la journée retombe alors sur les coordonnées de
      // l'événement, elle n'hérite pas d'un ancien point resté en base.
      latitude: d.latitude ?? null,
      longitude: d.longitude ?? null,
      order: d.order ?? index,
    }));

    // Une journée qui finirait avant de commencer n'est pas une journée.
    const backwards = normalized.find(
      (d) => d.startTime && d.endTime && d.endTime <= d.startTime,
    );
    if (backwards) {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_DAYS_INVALID,
        message: `« ${backwards.label} » : l'heure de fin doit suivre l'heure de début.`,
      });
    }
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
      // Dans la MÊME transaction que le remplacement des journées : un
      // nettoyage réussi suivi d’un échec sur les journées laisserait
      // l’événement sans billets ET sans journées.
      if (policyChanged) {
        await tx.ticket.deleteMany({ where: { eventId } });
      }

      // Remplacement en bloc, mais les journées conservées gardent leur `id` :
      // les billets qui les référencent ne doivent pas être détachés.
      await tx.eventDay.deleteMany({
        where: { eventId, date: { notIn: normalized.map((d) => d.date) } },
      });
      for (const day of normalized) {
        await tx.eventDay.upsert({
          where: { eventId_date: { eventId, date: day.date } },
          create: { eventId, ...day },
          update: {
            label: day.label,
            location: day.location,
            startTime: day.startTime,
            endTime: day.endTime,
            latitude: day.latitude,
            longitude: day.longitude,
            order: day.order,
          },
        });
      }
    });
  }

  private assertImagesAllowed(data: UpdateEventDto) {
    const urls = [
      data.logoUrl,
      data.coverImageUrl,
      data.officialMediaUrl,
      data.heroBackdropUrl,
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
        // Journées déclarées (2026-08-18) : elles portent le lieu et les
        // horaires propres à chaque jour. Sans elles ici, l'organisateur
        // pouvait saisir un lieu par journée qu'aucun acheteur ne verrait.
        days: { orderBy: { order: 'asc' } },
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

  /**
   * Tous les événements du manager, pour le sélecteur du tableau de bord
   * (2026-08-21). Volontairement MAIGRE : de quoi peupler une liste, pas de
   * quoi afficher une page — un manager Premium en a huit, et rapatrier huit
   * arbres complets à chaque chargement du dashboard ne servirait personne.
   */
  /**
   * Tous les événements du manager, avec de quoi les distinguer d'un coup
   * d'œil (2026-08-23).
   *
   * Cette liste alimentait un simple sélecteur ; elle porte maintenant une
   * PAGE. Un titre et une date ne suffisent plus à choisir entre huit
   * événements : il faut savoir lequel vend, lequel se remplit, et lequel
   * dort encore en brouillon.
   */
  async listMyEvents(managerId: string) {
    const evenements = await this.prisma.event.findMany({
      where: { managerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        accessMode: true,
        startDate: true,
        endDate: true,
        venueName: true,
        city: true,
        coverImageUrl: true,
        _count: { select: { tickets: true, days: true } },
        paymentProviderConfigs: {
          where: { isActive: true },
          select: { provider: true },
        },
      },
    });

    const ids = evenements.map((e) => e.id);
    if (ids.length === 0) return [];

    /*
     * Deux agrégats en DEUX requêtes, pas en 2×N : une boucle de comptages
     * par événement ferait seize allers-retours pour un manager Premium.
     */
    const [ventes, inscriptions] = await Promise.all([
      this.prisma.orderItem.groupBy({
        by: ['ticketId'],
        where: { order: { eventId: { in: ids }, status: 'PAID' } },
        _count: true,
      }),
      this.prisma.registration.groupBy({
        by: ['eventId'],
        where: { eventId: { in: ids } },
        _count: true,
      }),
    ]);

    // `groupBy` sur OrderItem donne des billets, pas des événements : on
    // repasse par les types de billets pour rattacher chaque vente au sien.
    const typesParEvenement = await this.prisma.ticket.findMany({
      where: { eventId: { in: ids } },
      select: { id: true, eventId: true },
    });
    const evenementDuType = new Map(typesParEvenement.map((t) => [t.id, t.eventId]));

    const ventesParEvenement = new Map<string, number>();
    for (const ligne of ventes) {
      const eventId = evenementDuType.get(ligne.ticketId);
      if (!eventId) continue;
      ventesParEvenement.set(eventId, (ventesParEvenement.get(eventId) ?? 0) + ligne._count);
    }

    const inscriptionsParEvenement = new Map(
      inscriptions.map((ligne) => [ligne.eventId, ligne._count]),
    );

    return evenements.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      status: e.status,
      accessMode: e.accessMode,
      startDate: e.startDate,
      endDate: e.endDate,
      venueName: e.venueName,
      city: e.city,
      coverImageUrl: e.coverImageUrl,
      typesDeBillets: e._count.tickets,
      journees: e._count.days,
      billetsVendus: ventesParEvenement.get(e.id) ?? 0,
      inscriptions: inscriptionsParEvenement.get(e.id) ?? 0,
      paiementActif: e.paymentProviderConfigs[0]?.provider ?? null,
    }));
  }
  /**
   * Un événement du manager authentifié. Sans `eventId`, celui du manager
   * mono-événement — voir EventAccessService pour le cas à plusieurs.
   */
  async getMyEvent(managerId: string, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        tickets: { orderBy: { createdAt: 'asc' } },
        // Journées déclarées (2026-08-16) — le Builder les édite et le
        // formulaire de billet y rattache les billets en régime PER_DAY.
        days: { orderBy: { order: 'asc' } },
      },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }

    /*
     * Deux compteurs pour l'écran de changement de régime (lot 3) : il doit
     * annoncer ce qui est CONSERVÉ avec des chiffres réels. Un avertissement
     * générique laisserait croire à une perte, et ferait reculer un
     * organisateur devant un changement inoffensif.
     */
    const [commandesPayees, inscriptions] = await Promise.all([
      this.prisma.order.count({ where: { eventId: id, status: 'PAID' } }),
      this.prisma.registration.count({ where: { eventId: id } }),
    ]);

    return { ...event, commandesPayees, inscriptions };
  }

  /**
   * Statistiques réelles de l'événement du manager : revenus, billets vendus,
   * répartition par type de billet, activité par scanner, tendance des
   * ventes sur 30 jours et taux de remplissage par type de billet (Analytics,
   * décision produit 2026-07-14). Calculées à la volée (V1 — pas de table
   * d'agrégats dédiée, `EventAnalytics` non branchée).
   */
  async getMyEventOverview(managerId: string, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);
    const event = await this.prisma.event.findUnique({
      where: { id },
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

    /*
     * Chiffres du régime « inscription simple » (2026-08-22). Sans eux,
     * l'accueil d'un événement sur inscription affiche « 0 F, 0 billet »
     * pendant que la liste se remplit — un écran qui ment à l’organisateur
     * est pire qu’un écran vide.
     */
    const [inscriptions, inscriptionsPresentes, inscriptionsRecentes] = await Promise.all([
      this.prisma.registration.count({ where: { eventId: id } }),
      this.prisma.registration.count({
        where: { eventId: id, checkedInAt: { not: null } },
      }),
      this.prisma.registration.findMany({
        where: { eventId: id },
        select: { createdAt: true },
      }),
    ]);

    return {
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        // Le régime commande ce que l'accueil doit montrer, et il n'était
        // affiché nulle part sur le tableau de bord.
        accessMode: event.accessMode,
      },
      inscriptions,
      inscriptionsPresentes,
      // Même série que les ventes, pour que la courbe existe aussi sans
      // billetterie : ce qui progresse dans le temps, ce sont les inscrits.
      inscriptionsOverTime: bucketSalesByDay(
        // `amount` porte ici un COMPTE, pas des francs : un montant nul
        // ferait conclure au graphique que la série est vide, et il
        // afficherait « rien à montrer » sur une liste qui se remplit.
        inscriptionsRecentes.map((r) => ({ paidAt: r.createdAt, amount: 1, itemCount: 1 })),
        SALES_TREND_DAYS,
      ),
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

  /**
   * État de prise en main d'un événement (2026-08-27).
   *
   * Calculé EN BASE, jamais deviné côté navigateur : une liste qui coche
   * « billetterie prête » alors que la table est vide vaut moins que pas de
   * liste du tout. Chaque étape répond à une question factuelle, et la
   * réponse vient de la donnée qui la porte.
   *
   * Les étapes dépendent du RÉGIME : un événement sur inscription n'a ni
   * tarifs ni encaissement, les lui réclamer serait lui promettre un travail
   * qui n'existe pas.
   */
  async getOnboarding(managerId: string, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    const evenement = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        accessMode: true,
        _count: { select: { tickets: true, scanners: true } },
        eventPage: { select: { blocks: true } },
        paymentProviderConfigs: { where: { isActive: true }, select: { provider: true } },
      },
    });

    if (!evenement) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    const surInscription = evenement.accessMode === EventAccessMode.RSVP;

    /*
     * `blocks` est un JSON : un tableau vide veut dire « page jamais
     * composée », et le rendu public retombe alors sur le gabarit statique.
     */
    const blocs = Array.isArray(evenement.eventPage?.blocks)
      ? (evenement.eventPage!.blocks as unknown[]).length
      : 0;

    const etapes = [
      {
        cle: 'page',
        faite: blocs > 0,
      },
      ...(surInscription
        ? []
        : [
            { cle: 'billets', faite: evenement._count.tickets > 0 },
            { cle: 'encaissement', faite: evenement.paymentProviderConfigs.length > 0 },
          ]),
      { cle: 'agents', faite: evenement._count.scanners > 0 },
      {
        cle: 'publication',
        faite: evenement.status === 'PUBLISHED',
      },
    ];

    return {
      eventId: evenement.id,
      eventTitle: evenement.title,
      accessMode: evenement.accessMode,
      etapes,
      faites: etapes.filter((e) => e.faite).length,
      total: etapes.length,
    };
  }

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
