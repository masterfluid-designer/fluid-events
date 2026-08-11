import type { TimelineEntry } from '@saas-events/types';
import { SectionEyebrow } from './section-eyebrow';

/**
 * TimelineStrip — bloc "Frise / Héritage" (storytelling, décision produit —
 * équivalent de la frise "Notre héritage" d'orncity). Ligne horizontale
 * connectée avec un point par jalon ; défile horizontalement sur mobile.
 * Pas de state client nécessaire — scroll natif CSS.
 */
export function TimelineStrip({ entries, title }: { entries: TimelineEntry[]; title?: string }) {
  if (entries.length === 0) return null;

  return (
    <div className="px-6 py-8 md:px-9">
      <div className="mb-6">
        <SectionEyebrow>{title || 'Notre histoire'}</SectionEyebrow>
      </div>
      <div className="flex gap-8 overflow-x-auto pb-2">
        {entries.map((entry, index) => (
          <div key={entry.id} className="relative min-w-50 flex-1 pt-5">
            <div
              className={`absolute left-0 right-0 top-1.5 h-px ${
                index === 0 ? 'left-1/2' : ''
              } ${index === entries.length - 1 ? 'right-1/2' : ''} bg-stroke dark:bg-strokedark`}
            />
            <div className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-primary" />
            {entry.date && (
              <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-accent-terracotta dark:text-accent-terracotta-dark">
                {entry.date}
              </div>
            )}
            <div className="mt-1 text-center text-sm font-semibold">{entry.label}</div>
            {entry.description && (
              <div className="mt-1 text-center text-xs text-waterloo dark:text-manatee">{entry.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
