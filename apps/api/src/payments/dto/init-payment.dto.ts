import { IsString } from 'class-validator';

/**
 * DTO — Body de POST /api/payments/init (CDC §8).
 *
 * Pas de champ `provider` : le fournisseur est déterminé côté serveur à
 * partir de la config PAR ÉVÉNEMENT de l'événement du billet (décision
 * produit 2026-07-13) — au plus un provider `isActive` par événement, le
 * client n'a jamais à le connaître ni le choisir (RULES.md §1 : la sécurité/
 * les décisions vivent dans NestJS, jamais côté client).
 */
export class InitPaymentDto {
  @IsString()
  ticketId!: string;
}
