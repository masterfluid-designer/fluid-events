import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

const INIT_URL = 'https://api-checkout.cinetpay.com/v2/payment';
const CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

export interface CinetPayCredentials {
  apiKey: string;
  siteId: string;
  secretKey: string;
}

export interface CinetPayInitParams {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  notifyUrl: string;
  returnUrl: string;
}

export interface CinetPayInitResult {
  paymentToken: string;
  paymentUrl: string;
}

export interface CinetPayCheckResult {
  status: string;
  amount: number;
  currency: string;
}

interface CinetPayApiResponse {
  code: string;
  message?: string;
  description?: string;
  data?: { payment_token?: string; payment_url?: string; status?: string; amount?: string | number; currency?: string };
}

/**
 * Ordre de concaténation exact des champs pour le HMAC x-token (doc CinetPay
 * "X-TOKEN HMAC") — HMAC-SHA256(secretKey, concat(champs dans cet ordre)).
 */
const HMAC_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
] as const;

/** Calcule le HMAC attendu pour une notification CinetPay (fonction pure, testable isolément). */
export function computeCinetPayHmac(
  payload: Partial<Record<(typeof HMAC_FIELDS)[number], string | undefined>>,
  secretKey: string,
): string {
  const concatenated = HMAC_FIELDS.map((field) => payload[field] ?? '').join('');
  return createHmac('sha256', secretKey).update(concatenated).digest('hex');
}

/**
 * CinetPayService — API Checkout REST (pas de SDK Node officiel, voir
 * ROADMAP.md §6 pour les repères techniques réunis depuis docs.cinetpay.com).
 *
 * Contrairement à Kkiapay, l'initiation renvoie une `payment_url` hébergée
 * par CinetPay (flux redirection, pas de widget JS embarqué) — le frontend
 * redirige simplement le navigateur.
 */
@Injectable()
export class CinetPayService {
  private readonly logger = new Logger(CinetPayService.name);

  async initPayment(credentials: CinetPayCredentials, params: CinetPayInitParams): Promise<CinetPayInitResult> {
    const response = await fetch(INIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: credentials.apiKey,
        site_id: credentials.siteId,
        transaction_id: params.transactionId,
        amount: params.amount,
        currency: params.currency,
        description: params.description,
        notify_url: params.notifyUrl,
        return_url: params.returnUrl,
        channels: 'ALL',
      }),
    });
    const body = (await response.json()) as CinetPayApiResponse;

    if (body.code !== '201' || !body.data?.payment_url) {
      this.logger.warn(`CinetPay init échoué (${params.transactionId}) : ${body.code} ${body.message}`);
      throw new Error(`CinetPay init échoué : ${body.code} ${body.message ?? ''} — ${body.description ?? ''}`);
    }

    return { paymentToken: body.data.payment_token ?? '', paymentUrl: body.data.payment_url };
  }

  /** Anti-fraude obligatoire — jamais se fier au seul x-token de la notification (RULES.md §2). */
  async checkTransaction(credentials: CinetPayCredentials, transactionId: string): Promise<CinetPayCheckResult> {
    const response = await fetch(CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: credentials.apiKey,
        site_id: credentials.siteId,
        transaction_id: transactionId,
      }),
    });
    const body = (await response.json()) as CinetPayApiResponse;

    return {
      status: body.data?.status ?? 'UNKNOWN',
      amount: Number(body.data?.amount ?? 0),
      currency: body.data?.currency ?? '',
    };
  }
}
