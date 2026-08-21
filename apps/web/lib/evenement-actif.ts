'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * L'événement sur lequel porte le tableau de bord (2026-08-21).
 *
 * Il vit dans l'URL (`?event=<id>`), et nulle part ailleurs. L'alternative —
 * un « événement actif » mémorisé côté serveur ou dans le navigateur — était
 * moins coûteuse, mais avec deux onglets ouverts sur deux événements, le
 * second écrase le contexte du premier : l'organisateur modifie alors la
 * billetterie du mauvais événement sans rien voir. Sur un produit qui
 * manipule des stocks et des prix, c'est inacceptable.
 *
 * Dans l'URL, chaque onglet garde le sien, et un lien envoyé à un collègue
 * ouvre bien ce qu'on lui montrait.
 */

export type EvenementDuManager = {
  id: string;
  slug: string;
  title: string;
  status: string;
  startDate: string;
};

/**
 * Ajoute l'événement visé à un chemin d'API. Sans identifiant, le chemin sort
 * inchangé : le serveur retombe alors sur l'événement du manager
 * mono-événement, comme avant le palier Premium.
 */
export function avecEvenement(chemin: string, eventId?: string): string {
  if (!eventId) return chemin;
  const separateur = chemin.includes('?') ? '&' : '?';
  return `${chemin}${separateur}eventId=${encodeURIComponent(eventId)}`;
}

/** Identifiant lu dans l'URL, ou `undefined` si la page n'en porte pas. */
export function useEvenementActif(): string | undefined {
  return useSearchParams().get('event') ?? undefined;
}

/**
 * Liste des événements du manager. Mise en cache une minute : elle ne change
 * qu'à la création d'un événement, et le tableau de bord la relit à chaque
 * changement de page.
 */
export function useMesEvenements() {
  return useQuery({
    queryKey: ['mes-evenements'],
    queryFn: () => api<EvenementDuManager[]>('/api/events/mine/list'),
    staleTime: 60_000,
  });
}

/**
 * Construit un lien du tableau de bord en conservant l'événement courant.
 * Sans cela, chaque changement d'onglet ramènerait au premier événement — ou,
 * pour un manager qui en a plusieurs, à un refus de choisir.
 */
export function lienDashboard(chemin: string, eventId?: string): string {
  if (!eventId) return chemin;
  const separateur = chemin.includes('?') ? '&' : '?';
  return `${chemin}${separateur}event=${encodeURIComponent(eventId)}`;
}
