import { IsEnum, IsString } from 'class-validator';
import { PaymentProviderType } from '@saas-events/types';

/**
 * DTO — Body de POST /api/payments/init (CDC §8).
 * V1 : seul KKIAPAY est réellement branché (CinetPay/FedaPay en roadmap).
 */
export class InitPaymentDto {
  @IsString()
  ticketId!: string;

  @IsEnum(PaymentProviderType)
  provider!: PaymentProviderType;
}
