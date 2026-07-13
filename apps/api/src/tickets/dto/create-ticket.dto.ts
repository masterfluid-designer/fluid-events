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
 * DTO — Création d'un type de billet (POST /api/events/:eventId/tickets).
 * L'ownership (event.managerId === user.id) est vérifié dans TicketsService,
 * pas ici (RULES.md §1 — la sécurité vit dans le service, jamais dans le DTO).
 */
export class CreateTicketDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsInt()
  @Min(0)
  stock!: number;

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

  // require_tld: false — le stockage S3-compatible en dev tourne sur
  // http://localhost:9000 (RustFS/MinIO), sans TLD ; isAllowedImageUrl()
  // (whitelist, TicketsService) reste la vraie garde de sécurité ici.
  @IsOptional()
  @IsUrl({ require_tld: false })
  designImageUrl?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designBgColor doit être un HEX strict (#rrggbb).' })
  designBgColor?: string;

  @IsOptional()
  @Matches(HEX_RE, { message: 'designTextColor doit être un HEX strict (#rrggbb).' })
  designTextColor?: string;
}
