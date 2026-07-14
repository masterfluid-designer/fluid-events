import { IsBoolean } from 'class-validator';

/** DTO — PATCH /api/admin/managers/:id/subscription (statut manuel, pas de facturation réelle en V1). */
export class SetManagerSubscriptionDto {
  @IsBoolean()
  subscriptionActive!: boolean;
}
