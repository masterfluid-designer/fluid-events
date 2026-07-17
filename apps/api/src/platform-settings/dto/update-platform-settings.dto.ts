import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/**
 * DTO — PUT /api/admin/platform-settings (Super Admin uniquement).
 * Tri-état par champ : absent = ne pas toucher, `null` = réinitialiser
 * (repli sur le texte "Fluid Events"), chaîne = nouveau SVG à assainir.
 */
export class UpdatePlatformSettingsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100_000)
  logoSvg?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100_000)
  iconSvg?: string | null;
}
