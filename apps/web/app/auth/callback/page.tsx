'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/api';

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
      // On réessaie avant d'abandonner : l'API peut être indisponible une ou
      // deux secondes (redéploiement, conteneur qui redémarre). Sans cette
      // reprise, un utilisateur authentifié avec succès se retrouve renvoyé
      // sur l'accueil pour un simple 502 passager — cas réellement observé
      // en production, l'API redémarrant à l'instant du retour OAuth.
      for (let tentative = 0; tentative < 3; tentative++) {
        try {
          const me = await api<{ role?: string }>('/api/auth/me');
          if (annule) return;
          router.replace(DESTINATIONS[me?.role ?? ''] ?? '/');
          return;
        } catch (err) {
          // 401 = pas de session : inutile d'insister, le résultat ne
          // changera pas. Seules les pannes réseau/serveur méritent un retry.
          if (err instanceof ApiError && err.status === 401) break;
          if (annule) return;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      // Ni session lisible, ni API joignable : on renvoie à l'accueil plutôt
      // que de laisser un écran de chargement sans issue.
      if (!annule) router.replace('/');
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
