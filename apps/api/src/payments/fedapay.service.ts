import { Injectable, Logger } from '@nestjs/common';
import { FedaPay, Transaction, Webhook } from 'fedapay';

export interface FedaPayCredentials {
  secretKey: string;
  environment: 'sandbox' | 'live';
}

export interface FedaPayInitParams {
  description: string;
  amount: number;
  currency: string;
  callbackUrl: string;
}

export interface FedaPayInitResult {
  transactionId: string;
  checkoutUrl: string;
}

export interface FedaPayTransactionStatus {
  status: string;
  amount: number;
}

/**
 * FedaPayService — enveloppe autour du SDK Node officiel (`fedapay` sur npm),
 * voir ROADMAP.md §6 pour les repères techniques réunis.
 *
 * ⚠️ Le SDK FedaPay configure ses identifiants via des setters STATIQUES
 * (`FedaPay.setApiKey()`/`setEnvironment()`), pas d'instance — global à tout
 * le process Node. La config étant maintenant PAR ÉVÉNEMENT, deux requêtes
 * concurrentes pour deux événements différents pourraient en théorie se
 * marcher dessus. On limite le risque en ne laissant JAMAIS de point
 * d'`await` entre `configure()` et l'appel SDK qui l'utilise : le SDK lit la
 * config statique de façon synchrone au moment de construire la requête
 * (avant son propre appel HTTP asynchrone), donc tant qu'aucun autre code
 * async ne s'intercale entre les deux lignes ci-dessous, chaque appel utilise
 * bien ses propres identifiants. Documenté comme limitation connue plutôt
 * qu'ignoré — un vrai correctif nécessiterait de ne plus dépendre de l'état
 * statique du SDK (ex : appels REST directs comme CinetPayService).
 */
@Injectable()
export class FedaPayService {
  private readonly logger = new Logger(FedaPayService.name);

  private configure(credentials: FedaPayCredentials): void {
    FedaPay.setApiKey(credentials.secretKey);
    FedaPay.setEnvironment(credentials.environment);
  }

  async initPayment(credentials: FedaPayCredentials, params: FedaPayInitParams): Promise<FedaPayInitResult> {
    this.configure(credentials);
    const transaction = await Transaction.create({
      description: params.description,
      amount: params.amount,
      currency: { iso: params.currency },
      callback_url: params.callbackUrl,
    });

    this.configure(credentials);
    const tokenResponse = await transaction.generateToken();
    const url = (tokenResponse as { url?: string }).url;
    if (!url) {
      throw new Error(`FedaPay generateToken() n'a pas renvoyé d'URL (transaction ${transaction.id}).`);
    }

    return { transactionId: String(transaction.id), checkoutUrl: url };
  }

  /** Anti-fraude obligatoire — jamais se fier au seul webhook (RULES.md §2). */
  async getTransactionStatus(credentials: FedaPayCredentials, transactionId: string): Promise<FedaPayTransactionStatus> {
    this.configure(credentials);
    const transaction = await Transaction.retrieve(transactionId);
    return { status: String((transaction as { status?: string }).status), amount: Number((transaction as { amount?: number }).amount ?? 0) };
  }

  /**
   * Vérifie la signature d'un webhook via le SDK officiel (`Webhook.constructEvent`)
   * — on ne réimplémente pas l'algorithme nous-mêmes (non documenté publiquement),
   * on délègue à l'implémentation vetted par FedaPay. Nécessite le corps BRUT
   * (avant parsing JSON) : le SDK signe la chaîne brute, pas l'objet re-sérialisé.
   */
  constructWebhookEvent(rawBody: string, signatureHeader: string, secret: string): { name: string; object: unknown } {
    return Webhook.constructEvent(rawBody, signatureHeader, secret);
  }
}
