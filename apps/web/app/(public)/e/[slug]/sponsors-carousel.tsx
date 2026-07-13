import type { MediaEntry } from '@saas-events/types';

/**
 * SponsorsCarousel — Bloc "sponsors" (décision produit 2026-07-13) : défilement
 * infini pur CSS (`--animate-marquee`, globals.css), pas de librairie JS. La
 * liste d'images est dupliquée une fois pour boucler sans à-coup (translateX
 * de -50% ramène exactement au début visuel de la première copie).
 */
export function SponsorsCarousel({ images }: { images: MediaEntry[] }) {
  const loop = [...images, ...images];

  return (
    <div className="overflow-hidden py-6">
      <div className="flex w-max animate-marquee items-center gap-10 hover:[animation-play-state:paused]">
        {loop.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${img.id}-${i}`}
            src={img.url}
            alt=""
            className="h-12 w-auto shrink-0 object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0"
          />
        ))}
      </div>
    </div>
  );
}
