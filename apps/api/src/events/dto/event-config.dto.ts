import { IsDateString, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

/**
 * Sous-DTOs — contenu centralisé de l'événement (décision produit
 * 2026-07-13, voir ROADMAP.md Phase 4). Édités depuis l'onglet "Config" du
 * Builder, consommés par les blocs de placement `faq`/`schedule`/`speakers`/
 * `gallery`/`sponsors` — un seul jeu de contenu par événement.
 *
 * `id` est généré côté client (crypto.randomUUID()) pour permettre l'édition
 * stable des listes (React key, suppression ciblée) — jamais utilisé comme
 * référence côté serveur, donc pas besoin d'un format ni d'une contrainte
 * d'unicité stricte ici.
 */

export class FaqEntryDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(300)
  question!: string;

  @IsString()
  @MaxLength(2000)
  answer!: string;
}

export class ScheduleEntryDto {
  @IsString()
  id!: string;

  @IsDateString()
  startsAt!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class SpeakerEntryDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(150)
  role!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

export class MediaEntryDto {
  @IsString()
  id!: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  role?: string;
}

/**
 * DTO — Une journée d'un événement multi-jours (décision produit 2026-08-16).
 *
 * Pas d'`id` : les journées sont remplacées en bloc à chaque enregistrement,
 * comme les FAQ ou les speakers. Un `id` client serait un identifiant que le
 * serveur devrait vérifier appartenir bien à l'événement — coût inutile pour
 * une liste de deux ou trois lignes.
 */
export class EventDayDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  /** Date civile (YYYY-MM-DD) — le scanner compare un jour du calendrier. */
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
