import type { TimelineEntry } from '@saas-events/types';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * TimelineStrip — bloc "Frise / Héritage" (storytelling, décision produit —
 * équivalent de la frise "Notre héritage" d'orncity). Ligne horizontale
 * connectée avec un point par jalon ; défile horizontalement sur mobile.
 * Pas de state client nécessaire — scroll natif CSS.
 */
export function TimelineStrip({ entries, title }: { entries: TimelineEntry[]; title?: string }) {
  if (entries.length === 0) return null;

  return (
    <SectionShell tone="muted">
      <SectionHeading eyebrow="Notre héritage" title={title || 'Notre histoire'} />

      <div className="-mx-1 flex gap-6 overflow-x-auto px-1 pb-3 md:gap-8">
        {entries.map((entry, index) => (
          <div key={entry.id} className="relative min-w-56 flex-1 pt-8 md:min-w-64">
            {/* Ligne horizontale — tronquée aux extrémités pour ne pas dépasser. */}
            <div
              className={`absolute top-2.5 h-px bg-stroke dark:bg-strokedark ${
                index === 0 ? 'left-1/2' : 'left-0'
              } ${index === entries.length - 1 ? 'right-1/2' : 'right-0'}`}
              aria-hidden="true"
            />
            <div
              className="absolute left-1/2 top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-primary dark:border-blackho"
              aria-hidden="true"
            />

            <div className="rounded-2xl border border-stroke bg-white p-5 text-center dark:border-strokedark dark:bg-blacksection">
              {entry.date && (
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-terracotta dark:text-accent-terracotta-dark">
                  {entry.date}
                </div>
              )}
              <div className="mt-1.5 font-event text-lg leading-tight">{entry.label}</div>
              {entry.description && (
                <p className="mt-2 text-xs leading-relaxed text-waterloo dark:text-manatee">
                  {entry.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
