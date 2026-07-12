import { IsDateString, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

/**
 * DTO — Création d'événement (POST /api/events).
 *
 * ⚠️ `managerId` n'est PAS un champ de ce DTO : il est dérivé du JWT
 * (`@CurrentUser()`), jamais accepté depuis le body. L'accepter du client
 * permettrait à n'importe quel compte de créer un événement au nom d'un
 * autre manager (IDOR) — RULES.md §1.
 */
export class CreateEventDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  slug!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
