import { ScanResult, TicketPolicy } from '@saas-events/types';
import type { QrVerification } from '../ticket-design/ticket-design.service';

/**
 * Date civile (YYYY-MM-DD) d'un instant dans un fuseau donné.
 *
 * Le contrôle d'accès compare un JOUR du calendrier, pas un instant : à
 * 23 h à Abidjan, le serveur peut déjà être le lendemain en UTC, et un
 * porteur se verrait refuser l'entrée le soir même de sa journée. `en-CA`
 * rend précisément le format ISO court, sans dépendance supplémentaire.
 *
 * Un fuseau invalide ferait lever `Intl` : on retombe alors sur UTC plutôt
 * que de refuser tous les billets d'un événement mal configuré.
 */
export function civilDateInTimeZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Date civile d'une journée stockée en colonne `DATE` (minuit UTC chez Prisma). */
export function civilDateOfEventDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
  event: {
    id: string;
    status: string;
    /** Régime de billetterie (2026-08-16). */
    ticketPolicy: TicketPolicy;
    /** Fuseau de l’événement — détermine quel jour civil est « aujourd’hui ». */
    timezone: string;
    /** Journées déclarées, vides en SINGLE_DAY. */
    days: Array<{ id: string; date: Date }>;
  } | null;
  orderItem: {
    id: string;
    isScanned: boolean;
    order: { status: string; client: { name: string | null } };
    ticket: { name: string; eventDayId: string | null };
  } | null;
  /** Instant du scan, injecté pour que la décision reste pure et testable. */
  now: Date;
}

export interface ScanDecision {
  result: ScanResult;
  /** Présent uniquement si result === VALID. Ne contient QUE name + ticketName. */
  attendee?: { name: string; ticketName: string };
  /** Indique si l'OrderItem doit être marqué scanné (uniquement si VALID). */
  shouldMarkScanned?: boolean;
  /**
   * Journée à enregistrer pour un pass multi-jours. Mutuellement exclusif
   * avec `shouldMarkScanned` : un pass ne consomme jamais `isScanned`, son
   * unicité vit sur (orderItem, journée).
   */
  dayScanFor?: string;
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

  // 8. Régime multi-jours (décision produit 2026-08-16)
  //
  // Placé APRÈS le verrou d'usage unique et le contrôle de paiement : un
  // billet impayé ou déjà consommé doit être refusé pour ce qu'il est, pas
  // renvoyé à une question de date.
  const policy = event.ticketPolicy ?? TicketPolicy.SINGLE_DAY;
  // Calculé seulement si le régime le demande : le mono-jour reste le chemin
  // le plus fréquent et ne doit rien payer pour une notion qu’il n’a pas.
  const today =
    policy === TicketPolicy.SINGLE_DAY
      ? ''
      : civilDateInTimeZone(ctx.now, event.timezone);

  if (policy === TicketPolicy.PER_DAY) {
    const boundDay = orderItem.ticket.eventDayId
      ? event.days.find((d) => d.id === orderItem.ticket.eventDayId)
      : undefined;
    // Un billet sans journée n'ouvre rien. La création l'interdit, mais un
    // billet créé avant le passage en PER_DAY peut exister : on refuse plutôt
    // que d'ouvrir par défaut — une porte qui s'ouvre par accident est pire
    // qu'un refus qu'un organisateur peut lever à la main.
    if (!boundDay || civilDateOfEventDay(boundDay.date) !== today) {
      return { result: ScanResult.WRONG_DAY };
    }
  }

  if (policy === TicketPolicy.PASS_ALL_DAYS) {
    const dayToday = event.days.find((d) => civilDateOfEventDay(d.date) === today);
    // Hors des journées déclarées : le pass est authentique mais aujourd'hui
    // ne fait pas partie de l'événement.
    if (!dayToday) {
      return { result: ScanResult.WRONG_DAY };
    }
    // Le pass ne consomme pas `isScanned` : c'est l'unicité
    // (orderItem, journée) qui limite à une entrée par jour, côté base.
    return {
      result: ScanResult.VALID,
      attendee: {
        name: orderItem.order.client.name ?? 'Inconnu',
        ticketName: orderItem.ticket.name,
      },
      dayScanFor: dayToday.id,
    };
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
