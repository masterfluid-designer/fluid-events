import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { PaymentProviderType } from '@saas-events/types';

/**
 * DTO — Configuration du fournisseur de paiement d'un événement par l'Admin
 * (`PUT /api/admin/events/:eventId/payment-config`, décision produit
 * 2026-07-13 : config PAR ÉVÉNEMENT, supersède BUSINESS.md §6).
 *
 * Les champs requis diffèrent par fournisseur — les identifiants exacts
 * viennent de la documentation officielle de chaque provider :
 *  - KKIAPAY   : publicKey (widget client) + privateKey + webhookSecret
 *  - CINETPAY  : siteId + privateKey (= apikey) + webhookSecret (= secret HMAC x-token)
 *  - FEDAPAY   : publicKey + privateKey (= clé secrète) + webhookSecret + environment
 *
 * `privateKey`/`webhookSecret` sont chiffrés (AES-256-GCM, CryptoService)
 * avant stockage — jamais renvoyés en clair par aucun endpoint (RULES.md §9).
 */
export class UpsertPaymentConfigDto {
  @IsEnum(PaymentProviderType)
  provider!: PaymentProviderType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // KKIAPAY et FEDAPAY exposent une clé publique au widget/SDK client.
  @ValidateIf((o) => o.provider === PaymentProviderType.KKIAPAY || o.provider === PaymentProviderType.FEDAPAY)
  @IsString()
  @MinLength(1)
  publicKey?: string;

  // Secret serveur — clé privée Kkiapay/FedaPay, ou apikey CinetPay.
  @IsString()
  @MinLength(1)
  privateKey!: string;

  // Secret webhook — Kkiapay/FedaPay, ou clé HMAC (x-token) CinetPay.
  @IsString()
  @MinLength(1)
  webhookSecret!: string;

  // CINETPAY uniquement : site_id (identifiant marchand, cf. docs.cinetpay.com).
  @ValidateIf((o) => o.provider === PaymentProviderType.CINETPAY)
  @IsString()
  @MinLength(1)
  siteId?: string;

  // FEDAPAY uniquement : environnement sandbox/live (FedaPay.setEnvironment()).
  @ValidateIf((o) => o.provider === PaymentProviderType.FEDAPAY)
  @IsIn(['sandbox', 'live'])
  environment?: 'sandbox' | 'live';
}
