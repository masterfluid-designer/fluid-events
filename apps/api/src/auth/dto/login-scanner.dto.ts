import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO — Connexion scanner (login email/password).
 *
 * Les scanners sont les SEULS utilisateurs à utiliser un mot de passe
 * (CDC §7.1). Les clients/managers passent par Google OAuth.
 */
export class LoginScannerDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
