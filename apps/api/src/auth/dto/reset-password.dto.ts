import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO — POST /api/auth/reset-password (2026-08-23).
 *
 * Le minimum de 8 caractères reprend celui de `LoginDto` : imposer ici une
 * exigence que la connexion ne connaît pas ferait des comptes qu'on ne peut
 * plus réinitialiser sans changer de mot de passe.
 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  // Le plafond protège bcrypt : au-delà de 72 octets il ignore silencieusement
  // la fin, et deux mots de passe distincts deviendraient interchangeables.
  @MaxLength(72)
  password!: string;
}
