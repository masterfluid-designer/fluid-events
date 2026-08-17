'use client';

import { useQuery } from '@tanstack/react-query';
import type { EventTheme } from '@saas-events/types';
import { api } from '@/lib/api';
import { resolveEventTheme } from '@/lib/event-theme';

/**
 * PublicSurface — Surface qui appartient au monde de la page publique
 * (décision produit 2026-08-17) : espace client et écrans du scanner.
 *
 * Deux effets, et le premier compte autant que le second :
 *
 *  1. La classe `.public-surface` REDÉCLARE la palette de base. Les thèmes de
 *     couleur des tableaux de bord sont posés sur <html> et descendent par
 *     héritage : sans cette remise à plat, un back-office en « Océan »
 *     teinterait le billet d'un acheteur qui n'a jamais rien choisi.
 *  2. Quand un événement est identifié, son thème (police + accent) est
 *     appliqué en `style` en ligne — qui l'emporte sur la classe.
 *
 * L'appel passe par l'endpoint PUBLIC de l'événement : aucun privilège requis,
 * un acheteur comme un scanner peuvent l'obtenir.
 */
export function PublicSurface({
  eventSlug,
  className = '',
  bare = false,
  children,
}: {
  /** Slug de l'événement dont on emprunte l'identité, si connu. */
  eventSlug?: string | null;
  className?: string;
  /**
   * N'applique QUE la palette et le thème, sans imposer de fond clair.
   * Le scanner garde son écran noir — on scanne dans des salles sombres, et
   * un fond blanc en pleine soirée éblouit celui qui tient le téléphone. Il
   * hérite en revanche de la couleur d'accent de l'événement.
   */
  bare?: boolean;
  children: React.ReactNode;
}) {
  const { data } = useQuery({
    queryKey: ['public-event-theme', eventSlug],
    queryFn: () =>
      api<{ eventPage: { theme: EventTheme | null } | null }>(
        `/api/events/public/${eventSlug}`,
      ),
    enabled: Boolean(eventSlug),
    // Le thème d'un événement ne change pas pendant qu'on consulte son billet.
    staleTime: 5 * 60 * 1000,
    // Un thème indisponible ne doit pas faire clignoter la page de tentatives :
    // la palette de base reste parfaitement utilisable.
    retry: false,
  });

  const theme = resolveEventTheme(data?.eventPage?.theme);

  return (
    <div
      className={`public-surface ${
        bare ? '' : 'min-h-svh bg-white text-black dark:bg-blackho dark:text-white'
      } ${theme.fontClassName} ${className}`}
      style={theme.style}
    >
      {children}
    </div>
  );
}
