import { IsEmail } from 'class-validator';

/**
 * DTO — POST /api/auth/forgot-password (2026-08-23).
 *
 * Une seule adresse, et rien d'autre : ni redirection, ni rôle, ni
 * identifiant d'événement. Tout paramètre supplémentaire sur une route
 * publique qui envoie un email est une prise pour en détourner l'usage.
 */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
