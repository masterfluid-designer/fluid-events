import { IsString, MinLength } from 'class-validator';

/** DTO — POST /api/auth/set-password (invitation Manager par email, décision produit 2026-07-14). */
export class SetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
