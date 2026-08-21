import { IsIn } from 'class-validator';
import { SubscriptionPlan } from '@saas-events/types';

/**
 * DTO — PATCH /api/admin/managers/:id/plan (2026-08-21).
 *
 * Remplace `SetManagerPremiumDto` et son booléen : le palier porte désormais
 * plusieurs limites (nombre d'événements, agents de contrôle, multi-jours), et
 * un troisième palier ne doit pas exiger de réécrire l'endpoint.
 *
 * Distinct de `SetManagerSubscriptionDto` : l'abonnement protège le compte de
 * la suppression automatique, le palier décide de ce qui est permis.
 */
export class SetManagerPlanDto {
  @IsIn(Object.values(SubscriptionPlan))
  plan!: SubscriptionPlan;
}
