import { Injectable } from '@nestjs/common';
import { kkiapay } from '@kkiapay-org/nodejs-sdk';

export interface KkiapayCredentials {
  publicKey: string;
  privateKey: string;
  secretKey: string;
  sandbox: boolean;
}

/** Forme normalisée de la réponse `k.verify()` (doc Node.js Admin SDK Kkiapay). */
export interface KkiapayTransactionStatus {
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | string;
  amount: number;
  transactionId: string;
  client?: { fullname?: string; phone?: string; email?: string };
  performedAt?: string;
}

/**
 * KkiapayService — Fine enveloppe autour du SDK Admin Node.js officiel Kkiapay
 * (`@kkiapay-org/nodejs-sdk`).
 *
 * Utilisé UNIQUEMENT pour la vérification serveur post-paiement (anti-fraude) :
 * la doc Kkiapay insiste explicitement — "Afin d'éviter toute fraude, procédez
 * à la vérification côté serveur de l'opération de transaction" — on ne fait
 * donc JAMAIS confiance au seul webhook ou au callback client pour confirmer
 * un paiement (RULES.md — ne jamais faire confiance à une donnée non revalidée).
 *
 * L'initiation du paiement est, elle, entièrement côté client (widget Kkiapay) :
 * il n'y a pas d'appel serveur "init transaction" chez Kkiapay.
 */
@Injectable()
export class KkiapayService {
  async verifyTransaction(
    credentials: KkiapayCredentials,
    transactionId: string,
  ): Promise<KkiapayTransactionStatus> {
    const client = kkiapay({
      publickey: credentials.publicKey,
      privatekey: credentials.privateKey,
      secretkey: credentials.secretKey,
      sandbox: credentials.sandbox,
    });
    return client.verify(transactionId);
  }
}
