/**
 * Tests unitaires — Builder concurrence optimiste
 * Contrôle de concurrence via lastKnownUpdatedAt (CDC §11.3).
 *
 * Garantie : si la page a été modifiée entre la lecture du client et sa
 * sauvegarde, on retourne 409 (CONFLICT) plutôt qu'écraser le travail d'autrui.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectConcurrencyConflict } from './builder.concurrency';

describe('detectConcurrencyConflict()', () => {
  it('retourne false si lastKnownUpdatedAt est null (première sauvegarde)', () => {
    const pageUpdatedAt = new Date('2026-06-01T12:00:00Z');
    expect(detectConcurrencyConflict(pageUpdatedAt, null)).toBe(false);
  });

  it('retourne false si la page n\'a pas bougé depuis la lecture', () => {
    const ts = '2026-06-01T12:00:00.000Z';
    const pageUpdatedAt = new Date(ts);
    expect(detectConcurrencyConflict(pageUpdatedAt, ts)).toBe(false);
  });

  it('retourne false si la page a été sauvegardée AVANT la lecture du client', () => {
    // Le client a lu à 12:01, la page a été modifiée à 12:00 → pas de conflit
    const pageUpdatedAt = new Date('2026-06-01T12:00:00Z');
    const lastKnown = '2026-06-01T12:01:00.000Z';
    expect(detectConcurrencyConflict(pageUpdatedAt, lastKnown)).toBe(false);
  });

  it('retourne true (CONFLICT) si la page a été modifiée APRÈS la lecture du client', () => {
    // Le client a lu à 12:00, un autre onglet a sauvegardé à 12:01 → conflit
    const pageUpdatedAt = new Date('2026-06-01T12:01:00Z');
    const lastKnown = '2026-06-01T12:00:00.000Z';
    expect(detectConcurrencyConflict(pageUpdatedAt, lastKnown)).toBe(true);
  });

  it('gère la comparaison stricte (égalité = pas de conflit)', () => {
    // Cas limite : même timestamp exact → pas de conflit (le client est à jour)
    const ts = '2026-06-01T12:00:00.000Z';
    expect(detectConcurrencyConflict(new Date(ts), ts)).toBe(false);
  });

  it('retourne false si lastKnownUpdatedAt est invalide (tolérance)', () => {
    const pageUpdatedAt = new Date('2026-06-01T12:00:00Z');
    // Pas de crash ; on est permissif (le schéma Zod rejette déjà en amont)
    expect(detectConcurrencyConflict(pageUpdatedAt, 'invalide')).toBe(false);
  });

  it('retourne false si lastKnownUpdatedAt est vide', () => {
    const pageUpdatedAt = new Date('2026-06-01T12:00:00Z');
    expect(detectConcurrencyConflict(pageUpdatedAt, '')).toBe(false);
  });

  it('détecte les microsecondes (précision maximale)', () => {
    const pageUpdatedAt = new Date('2026-06-01T12:00:00.500Z');
    const lastKnown = '2026-06-01T12:00:00.000Z';
    expect(detectConcurrencyConflict(pageUpdatedAt, lastKnown)).toBe(true);
  });
});
