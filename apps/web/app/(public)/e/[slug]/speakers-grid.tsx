'use client';

import { useMemo, useState } from 'react';
import type { SpeakerEntry } from '@saas-events/types';
import { SectionEyebrow } from './section-eyebrow';

/**
 * SpeakersGrid — grille "Line-up" avec filtre par catégorie (si au moins une
 * entrée en a une, ex: "DJ" / "Artiste" / "Speaker") — sinon grille simple,
 * comme avant.
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
    <div className="px-6 py-8 md:px-9">
      <SectionEyebrow>Speakers</SectionEyebrow>

      {categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
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
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {visible.map((speaker) => (
          <div key={speaker.id} className="flex flex-col items-center text-center">
            {speaker.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={speaker.photoUrl} alt={speaker.name} className="size-20 rounded-full object-cover" />
            ) : (
              <div className="size-20 rounded-full bg-secondary" />
            )}
            <div className="mt-2 text-sm font-semibold">{speaker.name}</div>
            <div className="text-xs text-waterloo dark:text-manatee">{speaker.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
