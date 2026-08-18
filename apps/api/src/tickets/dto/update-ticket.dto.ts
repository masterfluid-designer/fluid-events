import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { TicketSaleMode } from '@saas-events/types';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * DTO — Mise à jour partielle d'un ticket (PATCH /api/tickets/:id).
 * Tous les champs sont optionnels ; `stock` est volontairement exclu ici
 * (modifier la capacité totale après des ventes est une décision produit
 * non spécifiée — voir BUSINESS.md §12).
 */
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

  // `| null` : une date posée doit pouvoir être RETIRÉE. class-validator
  // ignore null sous @IsOptional(), le service distingue null d'undefined.
  @IsOptional()
  @IsDateString()
  promoEndsAt?: string | null;

  @IsOptional()
  @IsString()
  dayLabel?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerOrder?: number;

  @IsOptional()
  @IsString()
  category?: string;

  /** Voir CreateTicketDto — un tableau vide efface les bénéfices. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  features?: string[];

  /**
   * Vente en ligne ou sur demande (2026-08-18). En `ON_REQUEST`, l'API refuse
   * le billet au panier (`payments.service.ts`) : la page publique renvoie
   * vers l'organisateur au lieu de proposer un incrémenteur.
   */
  @IsOptional()
  @IsIn(Object.values(TicketSaleMode))
  saleMode?: TicketSaleMode;

  /** Pastille de qualification d'une formule sur demande. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  requestBadge?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  saleStartDate?: string | null;

  @IsOptional()
  @IsDateString()
  saleEndDate?: string | null;

  // require_tld: false — voir CreateTicketDto (stockage dev sur localhost).
  @IsOptional()
  @IsUrl({ require_tld: false })
  designImageUrl?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designBgColor doit être un HEX strict (#rrggbb).' })
  designBgColor?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designTextColor doit être un HEX strict (#rrggbb).' })
  designTextColor?: string;
}
