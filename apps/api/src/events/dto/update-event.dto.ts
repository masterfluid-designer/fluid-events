import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  Max,
  Min,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EventAccessMode, EventStatus, TicketPolicy } from '@saas-events/types';
import {
  EventDayDto,
  FaqEntryDto,
  MediaEntryDto,
  ScheduleEntryDto,
  SpeakerEntryDto,
} from './event-config.dto';

/**
 * DTO — Mise à jour de l'événement du manager (PATCH /api/events/mine).
 *
 * Le cycle de vie exact des statuts (transitions autorisées) n'est pas
 * tranché par le produit (BUSINESS.md §12) : on valide seulement que
 * `status` est une valeur connue de l'enum, sans state-machine imposée.
 *
 * Les champs de contenu centralisé (faqs/schedule/speakers/galleryImages/
 * sponsorImages/logoUrl, décision produit 2026-07-13) sont validés ici en
 * class-validator (contenu structuré, RULES.md — Zod réservé au contenu
 * libre comme les blocs Builder). Les URLs d'image sont revalidées contre la
 * whitelist de stockage dans `EventsService.updateMyEvent` (RULES.md §6) —
 * `@IsUrl` ne garantit qu'une forme d'URL, pas une origine autorisée.
 */
export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  coverImageUrl?: string;

  /**
   * Affiche officielle mise en avant dans le hero — image OU vidéo
   * (2026-08-19). `null` la retire : le hero retombe alors sur la couverture.
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  officialMediaUrl?: string | null;

  @IsOptional()
  @IsIn(['4:5', '1:1', '9:16'])
  officialMediaAspect?: string | null;

  /** Fond du hero — vide, l'affiche officielle sert de fond (2026-08-19). */
  @IsOptional()
  @IsUrl({ require_tld: false })
  heroBackdropUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
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

  /**
   * Régime de billetterie (décision produit 2026-08-16). Réservé aux Managers
   * Premium dès qu’il quitte SINGLE_DAY — contrôlé côté service, jamais ici.
   */
  @IsOptional()
  @IsEnum(TicketPolicy)
  ticketPolicy?: TicketPolicy;

  /**
   * Régime d'accès (plan 2026-08-21) : inscription simple, billetterie sans
   * compte, billetterie avec compte. La bascule n'est pas une écriture comme
   * une autre — elle passe par `EventAccessService.changerRegimeAcces`, qui
   * refuse de retirer la billetterie à des acheteurs déjà payants et
   * consigne le passage. Jamais écrite directement par `update`.
   */
  @IsOptional()
  @IsEnum(EventAccessMode)
  accessMode?: EventAccessMode;

  /**
   * Journées de l’événement, remplacées en bloc à chaque enregistrement.
   * Plafonnées à 31 : au-delà il ne s’agit plus d’un événement mais d’une
   * saison, que ce modèle (1 Manager = 1 Event) ne prétend pas couvrir.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => EventDayDto)
  days?: EventDayDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => FaqEntryDto)
  faqs?: FaqEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  schedule?: ScheduleEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SpeakerEntryDto)
  speakers?: SpeakerEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MediaEntryDto)
  galleryImages?: MediaEntryDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MediaEntryDto)
  sponsorImages?: MediaEntryDto[];

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
