import { IsEmail, IsString, MaxLength } from 'class-validator';

/**
 * DTO — Body de DELETE /api/admin/managers/:id (2026-08-22).
 *
 * La confirmation reprend l'ADRESSE EMAIL du manager, pas son identifiant :
 * l'identifiant se copie depuis l'URL sans regarder qui il désigne, l'adresse
 * oblige à lire la ligne qu'on s'apprête à effacer.
 *
 * C'est le seul garde-fou entre un clic et la disparition de commandes
 * payées — il vaut la friction qu'il coûte.
 */
export class DeleteManagerDto {
  @IsString()
  @IsEmail()
  @MaxLength(254)
  confirmationEmail!: string;
}
