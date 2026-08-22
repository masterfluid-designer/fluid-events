import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';

/**
 * StripeService — carte bancaire, Google Pay et Apple Pay (2026-08-22).
 *
 * ⚠️ Google Pay et Apple Pay ne sont PAS des fournisseurs distincts : ce sont
 * des portefeuilles qui présentent une carte. Stripe Checkout les affiche de
 * lui-même quand le navigateur du visiteur les propose — rien à configurer,
 * rien à stocker, aucune clé à demander à l'organisateur. Les modéliser comme
 * des fournisseurs aurait fait apparaître dans l'espace Admin deux lignes que
 * personne ne peut remplir.
 *
 * Appels REST directs plutôt que le SDK : `FedaPayService` documente le piège
 * du SDK à état statique, global au process, avec une configuration désormais
 * par événement. `CinetPayService` a déjà fait ce choix ; on le suit.
 */
export interface StripeCredentials {
  secretKey: string;
  webhookSecret: string;
}

export interface StripeInitParams {
  description: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Notre identifiant de commande — retrouvé tel quel dans le webhook. */
  orderId: string;
  customerEmail?: string | null;
}

export interface StripeInitResult {
  sessionId: string;
  checkoutUrl: string;
}

const API_BASE = 'https://api.stripe.com/v1';

/**
 * Devises SANS sous-unité chez Stripe : le montant s'envoie tel quel, jamais
 * multiplié par cent. Facturer 15 000 F en oubliant cette règle réclamerait
 * 1 500 000 F à l'acheteur — l'erreur la plus coûteuse de cette intégration,
 * et la plus facile à commettre.
 */
const DEVISES_SANS_DECIMALE = new Set([
  'XOF',
  'XAF',
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XPF',
]);

/** Tolérance sur l'horodatage du webhook, contre le rejeu d'un appel capturé. */
const TOLERANCE_SIGNATURE_SECONDES = 300;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /**
   * Convertit un montant vers la plus petite unité attendue par Stripe.
   * Exposé pour être testé seul : c'est la règle qui coûte le plus cher si
   * elle est fausse.
   */
  static versPlusPetiteUnite(amount: number, currency: string): number {
    const code = currency.toUpperCase();
    if (DEVISES_SANS_DECIMALE.has(code)) return Math.round(amount);
    return Math.round(amount * 100);
  }

  /**
   * Ouvre une session Checkout et renvoie l'URL vers laquelle rediriger.
   *
   * `client_reference_id` porte notre identifiant de commande : c'est lui
   * qu'on relit dans le webhook, plutôt que de faire confiance à ce que le
   * navigateur rapporte au retour.
   */
  async initPayment(
    credentials: StripeCredentials,
    params: StripeInitParams,
  ): Promise<StripeInitResult> {
    const corps = new URLSearchParams({
      mode: 'payment',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.orderId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': params.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(
        StripeService.versPlusPetiteUnite(params.amount, params.currency),
      ),
      'line_items[0][price_data][product_data][name]': params.description,
      // Retrouvé dans l'objet du webhook même si la session est reconstruite.
      'metadata[orderId]': params.orderId,
    });

    if (params.customerEmail) corps.set('customer_email', params.customerEmail);

    const reponse = await fetch(`${API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: corps.toString(),
    });

    const donnees = (await reponse.json().catch(() => null)) as
      | { id?: string; url?: string; error?: { message?: string } }
      | null;

    if (!reponse.ok || !donnees?.id || !donnees.url) {
      const detail = donnees?.error?.message ?? `HTTP ${reponse.status}`;
      this.logger.error(`Ouverture de session Stripe refusée : ${detail}`);
      throw new Error(`Stripe: ${detail}`);
    }

    return { sessionId: donnees.id, checkoutUrl: donnees.url };
  }

  /**
   * Vérifie la signature d'un webhook Stripe.
   *
   * La signature porte sur `${horodatage}.${corps brut}` — d'où la nécessité
   * du corps EXACT reçu, jamais du JSON re-sérialisé : un espace de plus et la
   * signature ne correspond plus.
   *
   * L'horodatage est vérifié en plus de la signature : sans cela, un appel
   * capturé resterait rejouable indéfiniment, et sa signature valide à jamais.
   */
  verifierSignature(
    corpsBrut: string,
    entete: string | undefined,
    webhookSecret: string,
    maintenant: number = Date.now(),
  ): boolean {
    if (!entete || !webhookSecret) return false;

    const parties = new Map(
      entete.split(',').map((p) => {
        const [cle, valeur] = p.split('=');
        return [cle?.trim(), valeur?.trim()] as [string, string];
      }),
    );

    const horodatage = parties.get('t');
    const signature = parties.get('v1');
    if (!horodatage || !signature) return false;

    const age = Math.abs(maintenant / 1000 - Number(horodatage));
    if (!Number.isFinite(age) || age > TOLERANCE_SIGNATURE_SECONDES) return false;

    const attendue = createHmac('sha256', webhookSecret)
      .update(`${horodatage}.${corpsBrut}`)
      .digest('hex');

    const a = Buffer.from(attendue, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    // Comparaison à temps constant : comparer avec `===` laisserait fuir, par
    // le temps de réponse, combien de caractères de tête sont corrects.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
