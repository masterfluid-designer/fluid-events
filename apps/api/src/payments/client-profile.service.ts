import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneService } from '../notifications/phone.service';
import { normalizeCountryCode } from '@saas-events/utils';

export interface EnrichmentData {
  /** undefined = pas de mise à jour (champ déjà renseigné ou invalide). */
  phone?: string;
  country?: string;
}

/**
 * ClientProfileService — Enrichissement du profil client post-paiement.
 *
 * Règle absolue du CDC §7.9 : on NE JAMAIS écraser phone/country existants.
 * Les providers africains collectent ces données au checkout ; on les persiste
 * uniquement si les champs sont absents en base.
 *
 * Séparation buildEnrichmentData (pure, testable) / enrichClientProfile (persistance)
 * pour faciliter le test unitaire de la logique métier.
 */
@Injectable()
export class ClientProfileService {
  private readonly logger = new Logger(ClientProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneService: PhoneService,
  ) {}

  /**
   * Calcule les données d'enrichissement (pure, sans BDD).
   * @returns les champs à mettre à jour, ou null si user introuvable.
   */
  buildEnrichmentData(
    user: { id: string; phone: string | null; country: string | null } | null,
    paymentData: any,
  ): EnrichmentData | null {
    if (!user) return null;

    // On ne renseigne ces champs QUE s'ils sont absents en base
    const shouldFillPhone = !user.phone;
    const shouldFillCountry = !user.country;

    const phone = shouldFillPhone
      ? this.phoneService.extractAndValidatePhone(paymentData)
      : undefined;

    const rawCountry = shouldFillCountry
      ? this.extractCountry(paymentData)
      : null;

    return {
      ...(phone ? { phone } : {}),
      ...(rawCountry ? { country: rawCountry } : {}),
    };
  }

  /**
   * Enrichit et persiste le profil client (CDC §7.9).
   * Non-bloquant : une erreur BDD est loggée mais ne propage pas.
   */
  async enrichClientProfile(
    clientId: string,
    paymentData: any,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: clientId },
        select: { id: true, phone: true, country: true },
      });
      if (!user) {
        this.logger.warn(`enrichClientProfile: user ${clientId} introuvable.`);
        return;
      }

      const data = this.buildEnrichmentData(user, paymentData);
      // `data` peut être un objet vide (rien à combler) — ne toucher la BDD,
      // et surtout ne pas estampiller `profileCompletedAt`, que si un champ a
      // réellement été renseigné (le nom du champ implique un événement réel,
      // pas une réécriture à chaque paiement).
      if (!data || Object.keys(data).length === 0) return;

      await this.prisma.user.update({
        where: { id: clientId },
        data: {
          ...data,
          profileCompletedAt: new Date(),
        },
      });
      this.logger.debug(`Profil enrichi pour user ${clientId}.`);
    } catch (err) {
      // Non-bloquant : le flux de paiement ne doit pas échouer à cause de l'enrichissement
      this.logger.warn(
        `Échec enrichissement profil ${clientId} : ${(err as Error).message}`,
      );
    }
  }

  /** Extrait et valide le code pays ISO 2 lettres du payload provider. */
  private extractCountry(payload: any): string | null {
    if (!payload) return null;
    const raw =
      payload.country ??
      payload.customer_country ??
      payload.transaction?.customer?.country ??
      null;
    return normalizeCountryCode(raw);
  }
}
