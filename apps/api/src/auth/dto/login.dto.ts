import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO — Connexion email/password générique (CLIENT/MANAGER/SUPER_ADMIN).
 *
 * Ajouté comme alternative à Google OAuth pour les comptes de test/dev
 * (voir prisma/seed.ts). Les comptes SCANNER restent sur /auth/login/scanner.
 */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
