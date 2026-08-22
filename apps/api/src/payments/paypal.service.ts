import { Injectable, Logger } from '@nestjs/common';

/**
 * PayPalService — commande PayPal et vérification de webhook (2026-08-22).
 *
 * ⚠️ PayPal ne signe PAS ses webhooks en HMAC, contrairement à Stripe,
 * Kkiapay ou CinetPay. La vérification consiste à RENVOYER l'appel reçu à
 * PayPal, qui répond s'il en est l'auteur. C'est un aller-retour réseau de
 * plus sur le chemin critique d'une confirmation de paiement — mais rien
 * d'autre ne prouve l'origine, et accepter sans vérifier reviendrait à
 * laisser n'importe qui marquer une commande comme payée.
 */
export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  environment: 'sandbox' | 'live';
}

export interface PayPalInitParams {
  description: string;
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  orderId: string;
}

export interface PayPalInitResult {
  paypalOrderId: string;
  approveUrl: string;
}

/**
 * Devises que PayPal n'accepte PAS en centimes : le montant s'écrit sans
 * décimale. Le franc CFA en fait partie — et PayPal REFUSE « 15000.00 ».
 */
const DEVISES_SANS_DECIMALE = new Set(['XOF', 'XAF', 'JPY', 'KRW', 'VND', 'CLP', 'HUF', 'TWD']);

function base(environment: 'sandbox' | 'live'): string {
  return environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);

  /** Formate un montant comme PayPal l'attend, selon la devise. */
  static formaterMontant(amount: number, currency: string): string {
    return DEVISES_SANS_DECIMALE.has(currency.toUpperCase())
      ? String(Math.round(amount))
      : amount.toFixed(2);
  }

  /**
   * Jeton d'accès OAuth. Non mis en cache volontairement : le cacher
   * imposerait de savoir à quel jeu d'identifiants il appartient, et la
   * configuration est PAR ÉVÉNEMENT. Un jeton réutilisé pour le mauvais
   * marchand encaisserait sur le mauvais compte.
   */
  private async jeton(credentials: PayPalCredentials): Promise<string> {
    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString(
      'base64',
    );

    const reponse = await fetch(`${base(credentials.environment)}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const donnees = (await reponse.json().catch(() => null)) as
      | { access_token?: string; error_description?: string }
      | null;

    if (!reponse.ok || !donnees?.access_token) {
      const detail = donnees?.error_description ?? `HTTP ${reponse.status}`;
      this.logger.error(`Authentification PayPal refusée : ${detail}`);
      throw new Error(`PayPal: ${detail}`);
    }

    return donnees.access_token;
  }

  async initPayment(
    credentials: PayPalCredentials,
    params: PayPalInitParams,
  ): Promise<PayPalInitResult> {
    const jeton = await this.jeton(credentials);

    const reponse = await fetch(`${base(credentials.environment)}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            // Notre identifiant voyage avec la commande et revient dans le
            // webhook : on ne se fie jamais à ce que le navigateur rapporte.
            custom_id: params.orderId,
            description: params.description.slice(0, 127),
            amount: {
              currency_code: params.currency.toUpperCase(),
              value: PayPalService.formaterMontant(params.amount, params.currency),
            },
          },
        ],
        application_context: {
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          user_action: 'PAY_NOW',
        },
      }),
    });

    const donnees = (await reponse.json().catch(() => null)) as
      | { id?: string; links?: Array<{ rel: string; href: string }>; message?: string }
      | null;

    const approbation = donnees?.links?.find((l) => l.rel === 'approve')?.href;

    if (!reponse.ok || !donnees?.id || !approbation) {
      const detail = donnees?.message ?? `HTTP ${reponse.status}`;
      this.logger.error(`Création de commande PayPal refusée : ${detail}`);
      throw new Error(`PayPal: ${detail}`);
    }

    return { paypalOrderId: donnees.id, approveUrl: approbation };
  }

  /**
   * Demande à PayPal si cet appel vient bien de lui.
   *
   * En cas d'échec réseau ou de réponse inattendue, on renvoie `false` : un
   * doute sur l'origine d'un webhook de paiement se tranche en le refusant.
   * PayPal réessaie ; une commande confirmée à tort ne se rattrape pas.
   */
  async verifierWebhook(
    credentials: PayPalCredentials,
    entetes: Record<string, string | undefined>,
    corps: unknown,
  ): Promise<boolean> {
    const requis = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-transmission-sig',
      'paypal-cert-url',
      'paypal-auth-algo',
    ];
    if (requis.some((cle) => !entetes[cle])) return false;

    try {
      const jeton = await this.jeton(credentials);

      const reponse = await fetch(
        `${base(credentials.environment)}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jeton}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transmission_id: entetes['paypal-transmission-id'],
            transmission_time: entetes['paypal-transmission-time'],
            cert_url: entetes['paypal-cert-url'],
            auth_algo: entetes['paypal-auth-algo'],
            transmission_sig: entetes['paypal-transmission-sig'],
            webhook_id: credentials.webhookId,
            webhook_event: corps,
          }),
        },
      );

      const donnees = (await reponse.json().catch(() => null)) as
        | { verification_status?: string }
        | null;

      return reponse.ok && donnees?.verification_status === 'SUCCESS';
    } catch (err) {
      this.logger.error(
        `Vérification du webhook PayPal impossible : ${(err as Error).message}`,
      );
      return false;
    }
  }
}
