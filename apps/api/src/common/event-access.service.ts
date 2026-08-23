import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCodes,
  EventAccessMode,
  SubscriptionPlan,
  limitesDuPlan,
  vendDesBillets,
} from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

/**
 * EventAccessService — à qui appartient quel événement, et ce que son palier
 * autorise (2026-08-21).
 *
 * Jusqu'ici, `Event.managerId` était unique : cinq services retrouvaient
 * l'événement du manager par `findUnique({ where: { managerId } })`, et
 * l'appartenance était garantie par le schéma lui-même. Le palier Premium
 * autorisant huit événements, cette garantie disparaît — il faut désormais la
 * VÉRIFIER, à chaque fois, au même endroit.
 *
 * Un seul contrôle plutôt que cinq copies : le danger de ce chantier n'est pas
 * un écran cassé, c'est un manager qui atteint l'événement d'un autre en
 * changeant un identifiant dans l'URL. Cinq copies, c'est cinq occasions d'en
 * oublier une.
 */
@Injectable()
export class EventAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Résout l'événement sur lequel une opération porte, et garantit qu'il
   * appartient bien à ce manager.
   *
   * `eventId` absent = compatibilité avec les routes `/mine`, qui n'ont jamais
   * eu besoin de le préciser. Ce raccourci ne vaut QUE pour un manager qui n'a
   * qu'un événement : avec plusieurs, deviner lequel il vise reviendrait à
   * choisir à sa place la billetterie qu'il modifie. On refuse alors
   * explicitement, plutôt que d'agir sur le mauvais.
   */
  async resoudreEvenementDuManager(managerId: string, eventId?: string): Promise<string> {
    if (eventId) {
      const evenement = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, managerId: true },
      });

      /*
       * Même réponse pour « n'existe pas » et « ne vous appartient pas » : une
       * erreur distincte confirmerait à un manager curieux qu'un identifiant
       * donné existe bien ailleurs sur la plateforme.
       */
      if (!evenement || evenement.managerId !== managerId) {
        throw new NotFoundException({
          code: ErrorCodes.EVENT_NOT_FOUND,
          message: "Aucun événement de ce compte manager ne correspond à cet identifiant.",
        });
      }

      return evenement.id;
    }

    const siens = await this.prisma.event.findMany({
      where: { managerId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });

    if (siens.length === 0) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }

    if (siens.length > 1) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_SELECTION_REQUIRED,
        message: 'Ce compte porte plusieurs événements : précisez lequel.',
      });
    }

    return siens[0].id;
  }

  /**
   * Résout l'événement d'un AGENT DE CONTRÔLE, et son régime (2026-08-23).
   *
   * Le pendant de `resoudreEvenementDuManager` pour l'autre métier de la
   * plateforme. L'agent ne choisit rien : son compte est rattaché à un
   * événement et à un seul, et cet identifiant ne vient JAMAIS de la
   * requête — sinon un agent de la soirée A lirait la liste nominative des
   * invités de la soirée B en changeant un paramètre.
   *
   * `isActive` est vérifié ici : révoquer un agent la veille doit lui fermer
   * la liste, pas seulement le scan.
   */
  async resoudreEvenementDeLAgent(
    userId: string,
  ): Promise<{ eventId: string; accessMode: EventAccessMode }> {
    const profil = await this.prisma.scanner.findUnique({
      where: { userId },
      select: {
        isActive: true,
        event: { select: { id: true, accessMode: true } },
      },
    });

    if (!profil || !profil.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement actif associé à ce compte de contrôle.',
      });
    }

    return {
      eventId: profil.event.id,
      accessMode: profil.event.accessMode as EventAccessMode,
    };
  }

  /**
   * Refuse la création d'un événement de plus que le palier n'en autorise.
   *
   * Le contrôle vit ici et non dans le client : RULES.md §1. Il compte les
   * événements RÉELS, sans exclure les brouillons ni les annulés — un
   * événement annulé continue d'occuper son slug, sa page et ses données.
   */
  async assertQuotaEvenements(managerId: string): Promise<void> {
    const [manager, existants] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: managerId }, select: { plan: true } }),
      this.prisma.event.count({ where: { managerId } }),
    ]);

    const limites = limitesDuPlan(manager?.plan as SubscriptionPlan | undefined);

    if (existants >= limites.maxEvenements) {
      throw new ForbiddenException({
        code: ErrorCodes.EVENT_QUOTA_REACHED,
        message:
          limites.maxEvenements === 1
            ? 'Vous avez déjà un événement associé à votre compte. Le palier Premium en autorise huit.'
            : `Votre palier autorise ${limites.maxEvenements} événements, et vous en avez déjà ${existants}.`,
        details: { existants, maximum: limites.maxEvenements },
      });
    }
  }

  /**
   * Change le régime d’accès d’un événement, ou refuse.
   *
   * UNE SEULE bascule est interdite : quitter la billetterie alors que des
   * places ont été vendues. Retirer sa page d’accès à quelqu’un qui a payé
   * n’est pas rattrapable — les autres sens ne retirent rien à personne.
   *
   * Rien n’est jamais détruit au passage : les blocs, les billets et les
   * inscriptions restent en base. Le régime ne commande que ce qui est
   * RENDU et ce qui est PROPOSÉ (voir `blocAutorise`), jamais ce qui est
   * stocké. Revenir en arrière restitue la page à l’identique.
   */
  async changerRegimeAcces(
    eventId: string,
    cible: EventAccessMode,
    managerId: string,
  ): Promise<{ avant: EventAccessMode; apres: EventAccessMode; commandesPayees: number }> {
    const evenement = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { accessMode: true },
    });

    if (!evenement) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    const avant = evenement.accessMode as EventAccessMode;

    // On compte les commandes payées quel que soit le sens : le chiffre
    // sert aussi à l’écran de confirmation, qui doit annoncer ce qui est
    // conservé plutôt qu’un avertissement vague.
    const commandesPayees = await this.prisma.order.count({
      where: { eventId, status: 'PAID' },
    });

    const quitteLaBilletterie = vendDesBillets(avant) && !vendDesBillets(cible);
    if (quitteLaBilletterie && commandesPayees > 0) {
      throw new ForbiddenException({
        code: ErrorCodes.EVENT_ACCESS_MODE_LOCKED,
        message: `Impossible de retirer la billetterie : ${commandesPayees} commande(s) ont déjà été payées.`,
        details: { commandesPayees },
      });
    }

    if (avant !== cible) {
      await this.prisma.event.update({ where: { id: eventId }, data: { accessMode: cible } });
      /*
       * L’audit porte l’état du moment, pas seulement le changement : un
       * manager qui bascule deux fois et perd le fil n’a aucun recours si
       * l’on n’a gardé que « avant → après ».
       */
      await this.audit.log('event.access_mode.changed', 'Event', eventId, {
        avant,
        apres: cible,
        commandesPayees,
      }, managerId);
    }

    return { avant, apres: cible, commandesPayees };
  }

  /**
   * Plafond d'agents de contrôle pour un événement.
   *
   * `Event.maxScanners` renseigné = dérogation accordée par l'Admin, elle prime.
   * `null` = suivre le palier du manager. Ce champ ne limitait rien avant le
   * 2026-08-21 : il valait 3 partout et personne ne le lisait.
   */
  async plafondScanners(eventId: string): Promise<number> {
    const evenement = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { maxScanners: true, manager: { select: { plan: true } } },
    });

    if (!evenement) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    if (evenement.maxScanners !== null && evenement.maxScanners !== undefined) {
      return evenement.maxScanners;
    }

    return limitesDuPlan(evenement.manager?.plan as SubscriptionPlan | undefined).maxScannersParEvenement;
  }
}
