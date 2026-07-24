import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EventStatus } from '@saas-events/types';
import { FaqEntryDto, MediaEntryDto, ScheduleEntryDto, SpeakerEntryDto } from './event-config.dto';

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
}
