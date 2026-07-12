import { IsDateString, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { EventStatus } from '@saas-events/types';

/**
 * DTO — Mise à jour de l'événement du manager (PATCH /api/events/mine).
 *
 * Le cycle de vie exact des statuts (transitions autorisées) n'est pas
 * tranché par le produit (BUSINESS.md §12) : on valide seulement que
 * `status` est une valeur connue de l'enum, sans state-machine imposée.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
