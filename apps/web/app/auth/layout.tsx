'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PublicSurface } from '@/components/public-surface';

/**
 * Écrans d'authentification — identité de la page publique, jamais celle des
 * tableaux de bord (décision produit 2026-08-17).
 *
 * On ne se connecte pas depuis un back-office : on arrive presque toujours
 * d'une page d'événement, en cours d'achat. Ces écrans doivent donc rester
 * dans le même univers, et surtout ne pas hériter du thème de couleur choisi
 * par un administrateur dans son espace — c'est ce que `PublicSurface`
 * garantit en redéclarant la palette de base.
 *
 * Quand la redirection pointe vers un événement, on emprunte carrément son
 * thème : l'acheteur ne quitte pas visuellement l'événement pour se connecter.
 */

/** Extrait le slug d'une cible de redirection de la forme `/e/<slug>`. */
function eventSlugFromRedirect(redirect: string | null): string | null {
  if (!redirect) return null;
  // La valeur vient de l'URL : on ne l'interprète que si elle a exactement la
  // forme attendue, jamais en la traitant comme une URL à suivre.
  const match = /^\/e\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[/?#]|$)/.exec(redirect);
  return match ? match[1] : null;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const slug =
    searchParams.get('event') ?? eventSlugFromRedirect(searchParams.get('redirect'));

  return <PublicSurface eventSlug={slug}>{children}</PublicSurface>;
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // `useSearchParams` impose une frontière Suspense.
  return (
    <Suspense fallback={null}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}
