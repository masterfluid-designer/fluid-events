import { IsString } from 'class-validator';

/** DTO — Rafraîchissement de la paire access/refresh token (clients uniquement). */
export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
