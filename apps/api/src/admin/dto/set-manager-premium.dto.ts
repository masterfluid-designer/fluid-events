import { IsBoolean } from 'class-validator';

/**
 * DTO — PATCH /api/admin/managers/:id/premium (décision produit 2026-08-16).
 *
 * Distinct de `SetManagerSubscriptionDto` : l'abonnement protège le compte de
 * la suppression automatique, le palier Premium débloque les options avancées
 * (événements sur plusieurs jours). Les deux se règlent séparément.
 */
export class SetManagerPremiumDto {
  @IsBoolean()
  isPremium!: boolean;
}
