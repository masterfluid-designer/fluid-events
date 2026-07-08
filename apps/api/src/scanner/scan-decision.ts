import { ScanResult } from '@saas-events/types';
import type { QrVerification } from '../ticket-design/ticket-design.service';

/**
 * Contexte de décision d'un scan — toutes les données nécessaires chargées
 * par le ScannerService avant l'appel à decideScan().
 *
 * ⚠️ Le `client` ne doit exposer QUE { name } — email/phone sont exclus de la
 * réponse finale (minimisation données, CDC §2.2). La couche de persistance
 * (Prisma select) garantit déjà ce filtrage à la source ; decideScan() ne
 * construit la réponse qu'avec les champs explicitement autorisés.
 */
export interface ScanContext {
  qrVerification: QrVerification;
  scanner: { id: string; isActive: boolean; eventId: string } | null;
  event: { id: string; status: string } | null;
  orderItem: {
    id: string;
    isScanned: boolean;
    order: { status: string; client: { name: string | null } };
    ticket: { name: string };
  } | null;
}

export interface ScanDecision {
  result: ScanResult;
  /** Présent uniquement si result === VALID. Ne contient QUE name + ticketName. */
  attendee?: { name: string; ticketName: string };
  /** Indique si l'OrderItem doit être marqué scanné (uniquement si VALID). */
  shouldMarkScanned?: boolean;
}

/**
 * Logique de décision d'un scan QR (CDC §9.5).
 *
 * Fonction PURE — ne touche pas la BDD. Elle prend un contexte déjà chargé
 * (scanner, event, orderItem) et détermine le résultat + la réponse à retourner.
 *
 * La persistance du verrou `isScanned` est faite par le ScannerService dans une
 * $transaction, en ré-appliquant ce verrou de façon atomique (CDC §9.5, §2.2).
 *
 * Ordre des vérifications (court-circuit) :
 *  1. QR valide (sinon INVALID / EXPIRED)
 *  2. Scanner existe et actif (sinon INVALID)
 *  3. payload.eid === scanner.eventId (sinon EVENT_MISMATCH)
 *  4. event.status === PUBLISHED (sinon EXPIRED)
 *  5. OrderItem existe (sinon INVALID)
 *  6. !isScanned (sinon ALREADY_USED)
 *  7. order.status === PAID (sinon INVALID)
 *  → sinon VALID + attendee { name, ticketName }
 */
export function decideScan(ctx: ScanContext): ScanDecision {
  const { qrVerification, scanner, event, orderItem } = ctx;

  // 1. Vérification du QR (avant toute recherche BDD)
  if (!qrVerification.valid) {
    return { result: qrVerification.reason ?? ScanResult.INVALID };
  }
  const payload = qrVerification.payload!;

  // 2. Scanner existe et actif
  if (!scanner || !scanner.isActive) {
    return { result: ScanResult.INVALID };
  }

  // 3. Correspondance événement
  if (payload.eid !== scanner.eventId) {
    return { result: ScanResult.EVENT_MISMATCH };
  }

  // 4. Événement actif (PUBLISHED)
  if (!event || event.status !== 'PUBLISHED') {
    return { result: ScanResult.EXPIRED };
  }

  // 5. OrderItem existe
  if (!orderItem) {
    return { result: ScanResult.INVALID };
  }

  // 6. Pas déjà scanné
  if (orderItem.isScanned) {
    return { result: ScanResult.ALREADY_USED };
  }

  // 7. Commande payée
  if (orderItem.order.status !== 'PAID') {
    return { result: ScanResult.INVALID };
  }

  // ✅ Cas nominal : VALID
  // ⚠️ On ne remonte QUE name + ticketName — email/phone JAMAIS (CDC §2.2).
  return {
    result: ScanResult.VALID,
    attendee: {
      name: orderItem.order.client.name ?? 'Inconnu',
      ticketName: orderItem.ticket.name,
    },
    shouldMarkScanned: true,
  };
}
