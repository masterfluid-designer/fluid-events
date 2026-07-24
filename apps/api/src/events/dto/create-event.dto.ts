import { IsDateString, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

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
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric with hyphens only',
  })
  slug!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
