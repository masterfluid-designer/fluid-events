'use client';

import { useEffect } from 'react';

/**
 * Cible de redirection OAuth quand la connexion Google s'est faite dans une
 * fenêtre pop-up (décision produit : ne plus quitter la page événement pour
 * s'authentifier, le panier reste intact dans l'onglet d'origine).
 *
 * À ce stade le backend a déjà posé les cookies de session sur l'origine —
 * cette page n'a donc plus qu'à prévenir la fenêtre parente et se fermer.
 *
 * ⚠️ Google interdit l'affichage de son écran de connexion en iframe : ce
 * flux DOIT passer par une vraie fenêtre (`window.open`), jamais par une
 * modale intégrée à la page.
 */
export default function AuthPopupCallbackPage() {
  useEffect(() => {
    try {
      // Origine explicite (jamais '*') : le message ne doit être lisible que
      // par notre propre page, pas par une fenêtre tierce qui nous aurait
      // ouverts.
      window.opener?.postMessage({ type: 'fluid-auth', ok: true }, window.location.origin);
    } catch {
      // `opener` inaccessible (fenêtre fermée, contexte cross-origin) — on
      // ferme quand même : la page parente retombera sur sa détection de
      // fermeture de pop-up.
    }
    window.close();
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold">Connexion réussie.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Vous pouvez fermer cette fenêtre et revenir à votre commande.
        </p>
      </div>
    </main>
  );
}
