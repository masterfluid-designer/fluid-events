'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Destination post-connexion, quand aucune cible précise n'a été demandée
 * (achat en cours, invitation…). Le rôle décide : un organisateur ou un
 * administrateur qui se connecte veut son tableau de bord, pas la page
 * d'accueil commerciale.
 *
 * Cette page existait déjà mais renvoyait tout le monde vers `/` — la
 * connexion Google ramenait donc systématiquement un Admin sur la page
 * publique, alors que la connexion par email/mot de passe, elle, routait
 * bien selon le rôle. Les deux chemins sont désormais cohérents.
 */

const DESTINATIONS: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  MANAGER: '/manager',
  SCANNER: '/scanner/scan',
  CLIENT: '/client',
};

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const me = await api<{ role?: string }>('/api/auth/me');
        if (annule) return;
        router.replace(DESTINATIONS[me?.role ?? ''] ?? '/');
      } catch {
        // Session illisible (cookie non posé, API injoignable) : on ne laisse
        // pas l'utilisateur sur un écran de chargement infini.
        if (!annule) router.replace('/');
      }
    })();

    return () => {
      annule = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4">
      <Spinner className="size-8" />
      <p className="text-sm text-manatee dark:text-waterloo">Connexion réussie, redirection...</p>
    </main>
  );
}
