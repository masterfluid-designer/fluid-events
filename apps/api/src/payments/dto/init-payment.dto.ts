import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsString, Min, ValidateNested } from 'class-validator';

/**
 * DTO — Body de POST /api/payments/init (CDC §8).
 *
 * Pas de champ `provider` : le fournisseur est déterminé côté serveur à
 * partir de la config PAR ÉVÉNEMENT de l'événement du billet (décision
 * produit 2026-07-13) — au plus un provider `isActive` par événement, le
 * client n'a jamais à le connaître ni le choisir (RULES.md §1 : la sécurité/
 * les décisions vivent dans NestJS, jamais côté client).
 *
 * `items` : panier de billets (plusieurs types/quantités possibles en un seul
 * paiement, décision produit — voir plan "panier multi-billets"). Tous les
 * `ticketId` doivent appartenir au même événement (vérifié service-side).
 */
export class InitPaymentItemDto {
  @IsString()
  ticketId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class InitPaymentDto {
  @ValidateNested({ each: true })
  @Type(() => InitPaymentItemDto)
  @ArrayMinSize(1)
  items!: InitPaymentItemDto[];
}
