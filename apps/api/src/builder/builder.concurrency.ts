/**
 * Contrôle de concurrence optimiste du Builder (CDC §11.3).
 *
 * Principe : le client envoie le `updatedAt` qu'il avait lu (lastKnownUpdatedAt).
 * Si la page en BDD a un `updatedAt` STRICTEMENT POSTÉRIEUR, c'est qu'une autre
 * session a sauvegardé entre-temps → on refuse (409 CONFLICT).
 *
 * Logique pure (sans BDD) → testable unitairement de façon déterministe.
 */

/**
 * @param pageUpdatedAt Date updatedAt actuelle de l'EventPage en base
 * @param lastKnownUpdatedAt ISO string envoyée par le client (ou null)
 * @returns true s'il y a un conflit (la page a été modifiée après la lecture client)
 */
export function detectConcurrencyConflict(
  pageUpdatedAt: Date,
  lastKnownUpdatedAt: string | null | undefined,
): boolean {
  // Première sauvegarde (jamais sauvegardé) → pas de conflit possible
  if (!lastKnownUpdatedAt) return false;

  const clientReadAt = new Date(lastKnownUpdatedAt);
  if (Number.isNaN(clientReadAt.getTime())) {
    // Date invalide → on est permissif (le schéma Zod rejette déjà en amont)
    return false;
  }

  // Conflit si la page a été modifiée STRICTEMENT après la lecture du client
  return pageUpdatedAt.getTime() > clientReadAt.getTime();
}
