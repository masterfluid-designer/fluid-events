import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * DTO — Body du webhook Kkiapay (doc "Webhook", tableau-de-bord/webhook.md).
 *
 * ⚠️ Le ValidationPipe global est `forbidNonWhitelisted: true` : TOUS les champs
 * documentés par Kkiapay (succès et échec) doivent être déclarés ici, sinon un
 * webhook légitime serait rejeté en 400. La plupart sont optionnels par
 * prudence (le contrat externe peut varier légèrement selon la méthode).
 */
export class KkiapayWebhookDto {
  @IsString()
  transactionId!: string;

  @IsBoolean()
  isPaymentSucces!: boolean;

  @IsIn(['transaction.success', 'transaction.failed'])
  event!: 'transaction.success' | 'transaction.failed';

  @IsOptional()
  @IsString()
  account?: string | null;

  @IsOptional()
  @IsString()
  failureCode?: string;

  @IsOptional()
  @IsString()
  failureMessage?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  fees?: number;

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  performedAt?: string;

  @IsOptional()
  @IsObject()
  stateData?: Record<string, unknown>;
}
