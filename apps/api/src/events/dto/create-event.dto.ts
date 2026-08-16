import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  // ─── Localisation structurée (décision produit 2026-08-16) ────────────────
  // `location` reste l'adresse d'affichage historique (hero, pied de page) ;
  // ces champs-ci alimentent le bloc de localisation de la page publique.

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  /** Étage, parking, repère visuel, consignes d'entrée. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessNotes?: string;

  // Bornes réelles du globe : une coordonnée hors bornes produirait un lien
  // Maps qui s'ouvre au milieu de nulle part, sans erreur visible.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  /**
   * Numéro officiel affiché publiquement. `@IsPhoneNumber()` sans région exige
   * un indicatif international — c'est ce qu'on veut, l'événement pouvant être
   * appelé depuis l'étranger, et cela délègue la validation à libphonenumber
   * plutôt qu'à une expression régulière maison forcément approximative.
   */
  @IsOptional()
  @IsPhoneNumber()
  contactPhone?: string;

  /**
   * Plafond réel (décision produit 2026-08-16) : la somme des stocks de tous
   * les billets ne pourra pas le dépasser. Le contrôle vit dans TicketsService
   * — ce DTO ne connaît pas les billets déjà en base.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedAttendees?: number;
}
