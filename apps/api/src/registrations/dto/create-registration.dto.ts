import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO — Body de POST /api/events/:slug/registrations (lot 2, 2026-08-22).
 *
 * Quatre champs, plus un champ libre que l'organisateur peut activer et
 * nommer. Un formulaire entièrement configurable a été écarté : c'est un
 * chantier à part, avec sa validation dynamique, son stockage variable et son
 * export à colonnes changeantes.
 *
 * Les plafonds de longueur ne sont pas décoratifs : ce formulaire est public,
 * et rien n'empêche d'y déposer un roman.
 */
export class CreateRegistrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  /**
   * Le libellé accompagne la réponse plutôt que d'être relu depuis la
   * configuration de l'événement : le changer plus tard ne doit pas réécrire
   * le sens des réponses déjà recueillies.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  extraLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  extraValue?: string;
}
