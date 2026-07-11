import { IsDateString, IsOptional, IsString, IsUrl, Matches } from 'class-validator';

/**
 * DTO — Création d'événement (POST /api/events).
 *
 * V1 : 1 Manager = 1 Event (CDC §1.4) — managerId doit référencer un User
 * existant avec le rôle MANAGER (pas encore vérifié ici, en attendant le
 * câblage des guards sur cette route).
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

  @IsString()
  managerId!: string;
}
