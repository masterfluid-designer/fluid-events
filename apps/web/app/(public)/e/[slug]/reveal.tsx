'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Révélation à l'entrée dans le viewport (2026-08-20).
 *
 * Trois partis pris, chacun contre une erreur classique :
 *
 *  - **Visible par défaut.** Le contenu est rendu normalement côté serveur ;
 *    c'est un `useEffect` qui le masque avant de le révéler. Une opacité à 0
 *    posée dans le HTML laisserait une page BLANCHE à qui n'exécute pas le
 *    JavaScript — et un moteur d'indexation lirait une page invisible.
 *
 *  - **Une seule fois.** L'observateur se débranche dès la première entrée :
 *    un élément qui rejoue son apparition à chaque passage donne le mal de
 *    mer sur une page longue qu'on remonte.
 *
 *  - **Silencieux si l'on préfère.** `prefers-reduced-motion` coupe tout, et
 *    le contenu reste simplement affiché.
 *
 * Les variantes existent pour que la page ne respire pas au même rythme
 * partout : un titre monte, une grille grandit, une bande s'efface. Toutes
 * finissent à l'identique — seul le chemin diffère.
 */

type Variante = 'up' | 'fade' | 'scale';

const DEPART: Record<Variante, string> = {
  up: 'opacity-0 translate-y-6',
  fade: 'opacity-0',
  scale: 'opacity-0 scale-[0.97]',
};

export function Reveal({
  children,
  variant = 'up',
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  variant?: Variante;
  /** Décalage en millisecondes — sert à faire arriver les éléments en cascade. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [etat, setEtat] = useState<'serveur' | 'cache' | 'visible'>('serveur');

  useEffect(() => {
    const noeud = ref.current;
    if (!noeud) return;

    const calme = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calme) {
      setEtat('visible');
      return;
    }

    // Déjà dans le viewport au chargement (le hero, le premier bloc) : on ne
    // le cache pas pour le re-révéler aussitôt, ce clignotement se voit.
    const dansLeViewport = noeud.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (dansLeViewport) {
      setEtat('visible');
      return;
    }

    setEtat('cache');
    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          setEtat('visible');
          observateur.disconnect();
        }
      },
      // Marge négative en bas : l'élément se révèle quand il est FRANCHEMENT
      // entré, pas au premier pixel — sinon l'animation se joue hors champ.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    observateur.observe(noeud);
    return () => observateur.disconnect();
  }, []);

  const classes =
    etat === 'cache'
      ? DEPART[variant]
      : etat === 'visible'
        ? 'opacity-100 translate-y-0 scale-100'
        : '';

  return (
    <div
      ref={ref}
      style={etat === 'cache' || etat === 'visible' ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${classes} ${className}`}
    >
      {children}
    </div>
  );
}
