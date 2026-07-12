import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
} from 'class-validator';

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
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerOrder?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  saleStartDate?: string;

  @IsOptional()
  @IsDateString()
  saleEndDate?: string;

  @IsOptional()
  @IsUrl()
  designImageUrl?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designBgColor doit être un HEX strict (#rrggbb).' })
  designBgColor?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designTextColor doit être un HEX strict (#rrggbb).' })
  designTextColor?: string;
}
