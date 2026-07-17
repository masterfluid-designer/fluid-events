import { IsNumberString, Length } from 'class-validator';

/** DTO — POST /api/auth/phone/confirm-verification. Code à 6 chiffres envoyé par WhatsApp. */
export class ConfirmPhoneVerificationDto {
  @IsNumberString()
  @Length(6, 6)
  code!: string;
}
