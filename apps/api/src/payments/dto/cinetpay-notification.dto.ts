import { IsOptional, IsString } from 'class-validator';

/**
 * DTO — Body de la notification CinetPay (doc "Prepare a notification page").
 *
 * ⚠️ Le ValidationPipe global est `forbidNonWhitelisted: true` : tous les
 * champs `cpm_*` participant au calcul du HMAC x-token doivent être déclarés
 * ici (voir `computeCinetPayHmac`, `cinetpay.service.ts`), sinon une
 * notification légitime serait rejetée en 400 avant même la vérification
 * de signature.
 */
export class CinetPayNotificationDto {
  @IsString()
  cpm_trans_id!: string;

  @IsOptional()
  @IsString()
  cpm_site_id?: string;

  @IsOptional()
  @IsString()
  cpm_trans_date?: string;

  @IsOptional()
  @IsString()
  cpm_amount?: string;

  @IsOptional()
  @IsString()
  cpm_currency?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsString()
  cel_phone_num?: string;

  @IsOptional()
  @IsString()
  cpm_phone_prefixe?: string;

  @IsOptional()
  @IsString()
  cpm_language?: string;

  @IsOptional()
  @IsString()
  cpm_version?: string;

  @IsOptional()
  @IsString()
  cpm_payment_config?: string;

  @IsOptional()
  @IsString()
  cpm_page_action?: string;

  @IsOptional()
  @IsString()
  cpm_custom?: string;

  @IsOptional()
  @IsString()
  cpm_designation?: string;

  @IsOptional()
  @IsString()
  cpm_error_message?: string;

  @IsOptional()
  @IsString()
  cpm_result?: string;
}
