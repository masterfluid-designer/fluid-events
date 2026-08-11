import { IsEmail, IsString, MaxLength } from 'class-validator';

/** DTO — Body de POST /api/tickets/recover (récupération de billet en libre-service). */
export class RecoverTicketsDto {
  @IsString()
  @MaxLength(50)
  orderNumber!: string;

  @IsEmail()
  email!: string;
}
