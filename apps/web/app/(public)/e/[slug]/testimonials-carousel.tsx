'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import type { TestimonialEntry } from '@saas-events/types';

/**
 * TestimonialsCarousel — Témoignages en boîtes défilables (décision produit
 * 2026-08-17). Le bloc n'affichait auparavant qu'un titre et un paragraphe.
 *
 * Défilement natif avec `scroll-snap` plutôt qu'une librairie de carrousel :
 * le geste tactile, l'inertie et la navigation clavier viennent du navigateur,
 * et rien ne casse si le JavaScript n'a pas encore chargé — les témoignages
 * restent lisibles et parcourables au doigt.
 *
 * Les flèches ne sont qu'un confort desktop : elles disparaissent quand tout
 * tient à l'écran et se désactivent aux extrémités.
 */
export function TestimonialsCarousel({ entries }: { entries: TestimonialEntry[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // Marge d'un pixel : les navigateurs arrondissent scrollLeft, et une
    // flèche resterait active à l'extrémité sans cette tolérance.
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    update();
    track.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [entries.length, update]);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    // On défile d'une carte visible, pas d'une largeur fixe : le nombre de
    // colonnes change entre mobile et desktop.
    const card = track.querySelector('[data-testimonial]') as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: step * direction, behavior: 'smooth' });
    // L'état des flèches ne doit pas dépendre du seul événement `scroll` :
    // certains contextes de rendu n'en émettent aucun (constaté en
    // vérification), et les flèches resteraient alors figées. On recalcule
    // une fois le déplacement terminé.
    window.setTimeout(update, 400);
  }

  if (entries.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        // `snap-x` + `overflow-x-auto` : défilement natif, tactile compris.
        // La barre de défilement est masquée, le geste reste possible.
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {entries.map((entry) => (
          <figure
            key={entry.id}
            data-testimonial
            className="flex w-[85%] shrink-0 snap-start flex-col justify-between rounded-2xl border border-stroke p-6 dark:border-strokedark sm:w-[55%] lg:w-[calc((100%-2rem)/3)]"
          >
            <Quote className="size-6 shrink-0 text-primary opacity-60" />
            <blockquote className="mt-4 text-sm leading-relaxed">{entry.quote}</blockquote>
            {(entry.author || entry.role) && (
              <figcaption className="mt-5 flex items-center gap-3 border-t border-stroke pt-4 dark:border-strokedark">
                {entry.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                )}
                <span className="min-w-0">
                  {entry.author && (
                    <span className="block truncate text-sm font-semibold">{entry.author}</span>
                  )}
                  {entry.role && (
                    <span className="block truncate text-xs text-waterloo dark:text-manatee">
                      {entry.role}
                    </span>
                  )}
                </span>
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {(canScrollLeft || canScrollRight) && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            aria-label="Témoignages précédents"
            onClick={() => scrollByCard(-1)}
            disabled={!canScrollLeft}
            className="flex size-9 items-center justify-center rounded-full border border-stroke transition-colors hover:bg-black/5 disabled:opacity-30 dark:border-strokedark dark:hover:bg-white/5"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Témoignages suivants"
            onClick={() => scrollByCard(1)}
            disabled={!canScrollRight}
            className="flex size-9 items-center justify-center rounded-full border border-stroke transition-colors hover:bg-black/5 disabled:opacity-30 dark:border-strokedark dark:hover:bg-white/5"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
