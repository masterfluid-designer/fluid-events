'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * AuthBackLink — Retour depuis un écran d'authentification (décision produit
 * 2026-08-17).
 *
 * Renvoie à la page PRÉCÉDENTE, pas à l'accueil : on arrive presque toujours
 * ici depuis une page d'événement, et être éjecté sur la page commerciale
 * après avoir renoncé à se connecter fait perdre l'événement qu'on regardait.
 *
 * Repli sur l'accueil quand il n'y a pas d'historique — onglet ouvert
 * directement sur le lien, ou premier écran d'une session : `router.back()`
 * ne ferait alors rien du tout, et le lien paraîtrait mort.
 */
export function AuthBackLink({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    // `history.length` n'est lisible qu'au navigateur, et vaut 1 quand
    // l'onglet n'a pas d'antécédent.
    setHasHistory(window.history.length > 1);
  }, []);

  return (
    <button
      type="button"
      onClick={() => (hasHistory ? router.back() : router.push('/'))}
      className={className}
    >
      ← {hasHistory ? 'Retour' : "Retour à l'accueil"}
    </button>
  );
}
