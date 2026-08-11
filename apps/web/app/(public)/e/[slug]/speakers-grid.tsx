'use client';

import { useMemo, useState } from 'react';
import type { SpeakerEntry } from '@saas-events/types';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * SpeakersGrid — grille "Line-up" en cartes portrait (pattern orncity), avec
 * filtre par catégorie si au moins une entrée en porte une (ex: "DJ" /
 * "Artiste" / "Speaker") — sinon grille simple.
 */
export function SpeakersGrid({ speakers }: { speakers: SpeakerEntry[] }) {
  const categories = useMemo(
    () => Array.from(new Set(speakers.map((s) => s.category).filter((c): c is string => Boolean(c)))),
    [speakers],
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const visible =
    categories.length === 0 || activeCategory === null
      ? speakers
      : speakers.filter((s) => s.category === activeCategory);

  return (
    <SectionShell>
      <SectionHeading
        eyebrow="Sur scène"
        title="Le line-up"
        description="Une programmation qui mêle têtes d'affiche et pépites locales."
      />

      {categories.length > 0 && (
        <div className="mb-7 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              activeCategory === null
                ? 'bg-primary text-primary-foreground'
                : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-waterloo dark:hover:border-white'
            }`}
          >
            Tous
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeCategory === category
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-waterloo dark:hover:border-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((speaker) => (
          <article
            key={speaker.id}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-stroke bg-alabaster dark:border-strokedark dark:bg-blacksection"
          >
            {speaker.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={speaker.photoUrl}
                alt={speaker.name}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="size-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_12px,#E7E4DE_12px_24px)] dark:bg-[repeating-linear-gradient(135deg,#24221F_0_12px,#1B1A18_12px_24px)]" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

            {speaker.category && (
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-black backdrop-blur">
                {speaker.category}
              </span>
            )}

            <div className="absolute inset-x-3 bottom-3 text-white">
              <div className="font-serif text-base leading-tight md:text-lg">{speaker.name}</div>
              <div className="mt-0.5 text-xs text-white/75">{speaker.role}</div>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
