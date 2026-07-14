import { IsEmail, IsString, MinLength } from 'class-validator';

/** DTO — POST /api/admin/managers (invitation par email, décision produit 2026-07-14). */
export class InviteManagerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;
}
