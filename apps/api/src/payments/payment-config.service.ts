import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes, PaymentProviderType } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import { AuditService } from '../common/audit.service';
import { EventAccessService } from '../common/event-access.service';
import { SUPPORTED_PAYMENT_PROVIDERS } from '../common/supported-payment-providers';
import { UpsertPaymentConfigDto } from '../admin/dto/upsert-payment-config.dto';

/**
 * Ce qu'un organisateur peut relire de sa propre configuration.
 *
 * ⚠️ **Aucune clé, pas même la publique** (décision produit 2026-08-24). Les
 * identifiants s'écrivent, ils ne se relisent pas : une fois soumis, l'écran
 * n'en montre plus rien, seulement le fait qu'ils sont en place et depuis
 * quand. Un « ••••abcd » aiderait à reconnaître un compte, mais chaque
 * caractère rendu est un caractère qui traîne dans un cache de navigateur, un
 * journal de proxy ou une capture d'écran de support.
 *
 * `config` reste exposé : il ne porte que le mode (`sandbox`/`live`) et
 * l'identifiant marchand CinetPay, qui figure déjà dans les URLs de paiement.
 */
const VUE_MANAGER = {
  id: true,
  provider: true,
  isActive: true,
  isGlobal: true,
  config: true,
  updatedAt: true,
} as const;

/**
 * PaymentConfigService — l'encaissement, réglé par l'organisateur lui-même
 * (2026-08-24).
 *
 * Jusqu'ici seul un Admin pouvait poser les clés de paiement d'un événement.
 * C'était le goulot d'étranglement de la plateforme : `payment_provider_configs`
 * est resté VIDE en production, et aucun billet n'a jamais pu être encaissé —
 * chaque organisateur devait attendre qu'un humain colle ses clés à sa place.
 *
 * La responsabilité passe au Manager, avec les mêmes garde-fous qu'avant :
 *
 *  - **L'événement vient du contrôle partagé**, jamais de la requête telle
 *    quelle : un organisateur ne configure pas l'encaissement d'un autre.
 *  - **Les secrets sont chiffrés** (AES-256-GCM) avant d'atteindre la base, et
 *    ne ressortent par aucune route.
 *  - **Un seul fournisseur actif** par événement : en activer un désactive les
 *    autres, dans la même transaction.
 */
@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly acces: EventAccessService,
  ) {}

  /** Les fournisseurs configurés pour un événement — jamais leurs clés. */
  async lister(managerId: string, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    const configs = await this.prisma.paymentProviderConfig.findMany({
      where: { eventId: id },
      select: VUE_MANAGER,
      orderBy: { provider: 'asc' },
    });

    return { eventId: id, configs };
  }

  /**
   * Enregistre les identifiants d'un fournisseur, et éventuellement les
   * recopie sur tous les événements de l'organisateur.
   *
   * Remplacement complet, jamais partiel : on ne peut pas « garder l'ancien
   * secret » en laissant un champ vide. Puisque rien ne se relit, une mise à
   * jour partielle demanderait à l'organisateur de deviner ce qui est encore
   * en place — c'est exactement ce qu'on refuse de lui faire faire.
   */
  async enregistrer(
    managerId: string,
    dto: UpsertPaymentConfigDto & { global?: boolean },
    eventId?: string,
  ) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);
    this.assertExecutable(dto.provider, dto.isActive);

    const cibles = dto.global ? await this.evenementsDuManager(managerId) : [id];

    const donnees = this.donneesChiffrees(dto);

    await this.prisma.$transaction(async (tx) => {
      for (const cible of cibles) {
        /*
         * Un seul fournisseur actif par événement. La désactivation des autres
         * vit DANS la transaction : sortie de là, une coupure réseau laisserait
         * deux fournisseurs actifs, et `PaymentsService` en choisirait un au
         * hasard de l'ordre de lecture.
         */
        if (dto.isActive) {
          await tx.paymentProviderConfig.updateMany({
            where: { eventId: cible, provider: { not: dto.provider } },
            data: { isActive: false },
          });
        }

        await tx.paymentProviderConfig.upsert({
          where: { eventId_provider: { eventId: cible, provider: dto.provider } },
          create: { eventId: cible, provider: dto.provider, ...donnees },
          update: donnees,
        });
      }
    });

    /*
     * L'audit porte le fournisseur, la portée et le nombre d'événements
     * touchés — jamais un fragment d'identifiant (RULES.md §9). Le nombre
     * compte : c'est ce qui permet de comprendre, trois semaines plus tard,
     * pourquoi huit événements ont changé de fournisseur le même jour.
     */
    await this.audit.log(
      'manager.provider.updated',
      'PaymentProviderConfig',
      id,
      {
        provider: dto.provider,
        isActive: dto.isActive ?? false,
        global: Boolean(dto.global),
        evenementsTouches: cibles.length,
      },
      managerId,
    );

    this.logger.log(
      `Config ${dto.provider} enregistrée par ${managerId} sur ${cibles.length} événement(s)`,
    );

    return this.lister(managerId, id);
  }

  /** Active ou désactive un fournisseur déjà configuré, sans toucher aux clés. */
  async basculer(
    managerId: string,
    provider: PaymentProviderType,
    isActive: boolean,
    eventId?: string,
  ) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);
    this.assertExecutable(provider, isActive);

    const existante = await this.prisma.paymentProviderConfig.findUnique({
      where: { eventId_provider: { eventId: id, provider } },
      select: { id: true },
    });

    if (!existante) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: `Aucun identifiant ${provider} enregistré pour cet événement.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.paymentProviderConfig.updateMany({
          where: { eventId: id, provider: { not: provider } },
          data: { isActive: false },
        });
      }
      await tx.paymentProviderConfig.update({
        where: { eventId_provider: { eventId: id, provider } },
        data: { isActive },
      });
    });

    await this.audit.log(
      'manager.provider.updated',
      'PaymentProviderConfig',
      id,
      { provider, isActive },
      managerId,
    );

    return this.lister(managerId, id);
  }

  /** Retire un fournisseur et ses identifiants de cet événement. */
  async supprimer(managerId: string, provider: PaymentProviderType, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    await this.prisma.paymentProviderConfig.deleteMany({ where: { eventId: id, provider } });

    await this.audit.log(
      'manager.provider.removed',
      'PaymentProviderConfig',
      id,
      { provider },
      managerId,
    );

    return this.lister(managerId, id);
  }

  /**
   * Recopie les configurations globales du manager sur un événement qui vient
   * de naître (2026-08-24).
   *
   * C'est ce qui donne son sens au mot « hériter » : sans cela, « appliquer à
   * tous mes événements » ne vaudrait que pour ceux existant à l'instant du
   * clic, et le neuvième événement d'un organisateur Premium arriverait muet.
   *
   * Best-effort volontaire : un échec ici ne doit pas faire échouer la
   * création de l'événement. L'organisateur verrait sa soirée refusée pour une
   * histoire de clés recopiées — et l'écran « Mes événements » signale déjà un
   * événement publié sans encaissement.
   */
  async heriterDesConfigsGlobales(managerId: string, eventId: string): Promise<number> {
    try {
      const globales = await this.prisma.paymentProviderConfig.findMany({
        where: { isGlobal: true, event: { managerId } },
        orderBy: { updatedAt: 'desc' },
      });

      if (globales.length === 0) return 0;

      // Une seule ligne par fournisseur : la plus récente gagne, les copies
      // plus anciennes portées par d'autres événements ne doivent pas la
      // réécrire dans le désordre.
      const parFournisseur = new Map<string, (typeof globales)[number]>();
      for (const g of globales) {
        if (!parFournisseur.has(g.provider)) parFournisseur.set(g.provider, g);
      }

      await this.prisma.paymentProviderConfig.createMany({
        data: [...parFournisseur.values()].map((g) => ({
          eventId,
          provider: g.provider,
          isActive: g.isActive,
          isGlobal: true,
          publicKey: g.publicKey,
          privateKey: g.privateKey,
          webhookSecret: g.webhookSecret,
          config: (g.config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });

      this.logger.log(
        `${parFournisseur.size} config(s) de paiement héritée(s) sur l'événement ${eventId}`,
      );
      return parFournisseur.size;
    } catch (err) {
      this.logger.error(
        `Héritage des configs de paiement impossible sur ${eventId} : ${
          err instanceof Error ? err.message : err
        }`,
      );
      return 0;
    }
  }

  /** Les identifiants chiffrés et les options, prêts pour un create ou un update. */
  private donneesChiffrees(dto: UpsertPaymentConfigDto & { global?: boolean }) {
    const options: Record<string, unknown> = {};
    if (dto.provider === PaymentProviderType.CINETPAY && dto.siteId) options.siteId = dto.siteId;
    if (dto.environment) options.environment = dto.environment;

    return {
      isActive: dto.isActive ?? false,
      isGlobal: Boolean(dto.global),
      publicKey: dto.publicKey ?? null,
      privateKey: this.crypto.encrypt(dto.privateKey),
      webhookSecret: this.crypto.encrypt(dto.webhookSecret),
      config:
        Object.keys(options).length > 0
          ? (options as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    };
  }

  private async evenementsDuManager(managerId: string): Promise<string[]> {
    const siens = await this.prisma.event.findMany({
      where: { managerId },
      select: { id: true },
    });
    return siens.map((e) => e.id);
  }

  /**
   * Refuse d'ACTIVER un fournisseur dont l'exécution n'est pas branchée.
   *
   * Enregistrer ses clés reste permis : un organisateur peut vouloir les
   * préparer. Ce qu'on refuse, c'est de publier une page qui promet un
   * paiement que le serveur ne sait pas conduire.
   */
  private assertExecutable(provider: PaymentProviderType, isActive: boolean | undefined): void {
    if (isActive && !SUPPORTED_PAYMENT_PROVIDERS.includes(provider)) {
      throw new BadRequestException({
        code: ErrorCodes.PROVIDER_EXECUTION_NOT_SUPPORTED,
        message: `L'encaissement ${provider} n'est pas encore branché sur la plateforme : vos identifiants peuvent être enregistrés, mais pas activés.`,
      });
    }
  }
}
