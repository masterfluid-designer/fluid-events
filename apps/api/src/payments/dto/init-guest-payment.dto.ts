import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InitPaymentItemDto } from './init-payment.dto';

/**
 * DTO — Body de POST /api/payments/init-guest (lot 1, 2026-08-22).
 *
 * Achat sans compte. Le corps porte de quoi joindre l'acheteur et lui envoyer
 * son billet — rien de plus : ni mot de passe, ni identifiant, ni régime
 * d'accès. Le régime est relu en base à partir du slug, jamais reçu du client,
 * sinon la porte s'ouvre par un simple appel d'API.
 *
 * `phone` reste optionnel : il sert à joindre l'acheteur et à pré-remplir le
 * formulaire du prestataire de paiement. Un numéro illisible ne doit pas faire
 * perdre une vente — le service le normalise, ou l'ignore.
 */
export class InitGuestPaymentDto {
  @IsString()
  @MinLength(1)
  eventSlug!: string;

  @ValidateNested({ each: true })
  @Type(() => InitPaymentItemDto)
  @ArrayMinSize(1)
  items!: InitPaymentItemDto[];

  /**
   * L'adresse porte le billet : c'est le seul moyen pour l'acheteur de le
   * retrouver, puisqu'il n'aura pas de tableau de bord.
   */
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
