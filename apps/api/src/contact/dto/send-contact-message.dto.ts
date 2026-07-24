import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** DTO — POST /api/contact (formulaire public /contact, /support). */
export class SendContactMessageDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MaxLength(5000)
  message!: string;
}
