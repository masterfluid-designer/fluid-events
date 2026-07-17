import { IsNotEmpty, IsString } from 'class-validator';

/** DTO — POST /api/auth/phone/request-verification. Format validé par PhoneService (E.164). */
export class RequestPhoneVerificationDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
