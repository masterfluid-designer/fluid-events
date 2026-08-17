'use client';

import { useEffect, useRef, useState } from 'react';
import type { MediaEntry } from '@saas-events/types';

/**
 * SponsorsCarousel — Bloc "sponsors" (décision produit 2026-07-13) : défilement
 * infini, animation CSS (`--animate-marquee`, globals.css), sans librairie.
 *
 * ⚠️ L'animation translate de -50%, ce qui n'est continu que si la bande
 * contient exactement DEUX copies identiques ET qu'une copie couvre au moins
 * la largeur visible. Sinon la bande sort du champ et laisse du vide — au
 * point de paraître absente sur grand écran (bug réel signalé sur desktop et
 * tablette, 2026-08-17, avec trois logos).
 *
 * Pourquoi mesurer en JS plutôt qu'un `min-w-full` : un pourcentage se résout
 * contre le bloc conteneur, ici la bande elle-même en `w-max`, dont la largeur
 * dépend de son contenu. La contrainte est circulaire et reste sans effet
 * (constaté : 1120 px de contenu pour 1152 px de conteneur). On compte donc
 * combien de répétitions sont nécessaires, et on recompte au redimensionnement.
 */
export function SponsorsCarousel({ images }: { images: MediaEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const [repeats, setRepeats] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const base = baseRef.current;
    if (!container || !base) return;

    function measure() {
      // `base` contient `repeats` copies : on revient à la largeur d'une seule
      // pour que le calcul ne dépende pas du résultat précédent.
      const unit = base!.scrollWidth / repeats;
      if (unit <= 0) return;
      const needed = Math.max(1, Math.ceil(container!.clientWidth / unit));
      setRepeats((prev) => (prev === needed ? prev : needed));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [repeats, images.length]);

  const logos = Array.from({ length: repeats }).flatMap((_, r) =>
    images.map((img) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${img.id}-${r}`}
        src={img.url}
        // Le carrousel reste compact/infini (décision produit 2026-07-13) —
        // le rôle du partenaire ("Partenaire hébergement officiel", etc.)
        // s'affiche au survol plutôt que redesigner en cartes statiques.
        title={img.role}
        alt={img.role ?? ''}
        className="h-12 w-auto shrink-0 object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0"
      />
    )),
  );

  return (
    <div ref={containerRef} className="overflow-hidden py-6">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        <div ref={baseRef} className="flex shrink-0 items-center gap-10 pr-10">
          {logos}
        </div>
        {/* Copie strictement identique — c'est elle qui rend le -50% continu.
            Masquée aux lecteurs d'écran : les partenaires ne doivent pas être
            énumérés deux fois. */}
        <div aria-hidden="true" className="flex shrink-0 items-center gap-10 pr-10">
          {logos}
        </div>
      </div>
    </div>
  );
}
