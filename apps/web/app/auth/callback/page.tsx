'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';

/**
 * Fallback post-OAuth (CDC §7.4) — n'est atteint que si `GET /api/auth/google`
 * a été appelé sans `redirect` valide (sinon le backend redirige directement
 * vers la cible d'origine, ex : `/e/[slug]?resume=1` pour reprendre un achat).
 * Simple filet de sécurité pour éviter une impasse : renvoie vers l'accueil.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/'), 1200);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-alabaster dark:bg-blackho">
      <Spinner className="size-8" />
      <p className="text-sm text-manatee dark:text-waterloo">Connexion réussie, redirection...</p>
    </main>
  );
}
