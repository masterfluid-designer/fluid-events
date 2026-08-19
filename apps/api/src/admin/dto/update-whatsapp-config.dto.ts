import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO — Messagerie WhatsApp de la plateforme
 * (`PUT /api/admin/whatsapp-config`, décision produit 2026-08-19).
 *
 * Ces réglages ne vivaient qu'en variables d'environnement : changer de
 * numéro ou de modèle approuvé imposait un accès au serveur et un
 * redémarrage. Ils deviennent modifiables depuis l'espace Admin.
 *
 * `accessToken` est chiffré (AES-256-GCM) avant stockage et n'est JAMAIS
 * renvoyé en clair — même règle que les clés de paiement (RULES.md §9).
 * Absent = inchangé ; chaîne vide = effacé.
 */
export class UpdateWhatsappConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNumberId?: string;

  /** Version de l'API Graph — « v21.0 » par défaut côté service. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  apiVersion?: string;

  /**
   * Modèles approuvés dans Meta Business Manager. Meta interdit le texte
   * libre : seul un modèle validé part, d'où ces noms saisis à la main.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ticketTemplate?: string;

  @IsOptional()
  @IsIn(['fr', 'en', 'fr_FR', 'en_US'])
  ticketLang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  verifyTemplate?: string;

  @IsOptional()
  @IsIn(['fr', 'en', 'fr_FR', 'en_US'])
  verifyLang?: string;
}
