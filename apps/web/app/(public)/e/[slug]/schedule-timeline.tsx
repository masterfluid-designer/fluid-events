'use client';

import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Programme filtrable par journée (décision produit 2026-08-19).
 *
 * La journée d'une entrée n'est PAS un champ : elle se déduit de sa date.
 * Ajouter une colonne obligerait l'organisateur à ranger chaque entrée à la
 * main, et à corriger ce rangement chaque fois qu'il déplace un horaire — le
 * calendrier le dit déjà.
 *
 * Les onglets restent affichés même sans aucune entrée : ils annoncent le
 * découpage à venir, ce qui vaut mieux qu'un bloc muet.
 */

export interface ScheduleDay {
  id: string;
  label: string;
  /** Date civile ISO — c'est elle qui rattache les entrées à la journée. */
  date: string;
}

export interface ScheduleEntry {
  id: string;
  startsAt: string;
  title: string;
  description?: string | null;
}

/**
 * Jour civil d'un instant, dans le fuseau du visiteur — le même que celui qui
 * sert à AFFICHER l'heure juste en dessous. Comparer en UTC rangerait une
 * séance de 23h dans la journée suivante pour qui la lit à 23h.
 */
function civilDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ScheduleTimeline({
  entries,
  days,
}: {
  entries: ScheduleEntry[];
  days: ScheduleDay[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [entries],
  );

  // Une journée n'apparaît que si elle a une date : sans elle, rien à
  // rattacher, l'onglet ne filtrerait jamais rien.
  const usableDays = useMemo(() => days.filter((d) => Boolean(d.date)), [days]);

  const visible = useMemo(() => {
    if (!selected) return sorted;
    const day = usableDays.find((d) => d.id === selected);
    if (!day) return sorted;
    const target = day.date.slice(0, 10);
    return sorted.filter((e) => civilDay(e.startsAt) === target);
  }, [sorted, selected, usableDays]);

  return (
    <div className="flex flex-col gap-6">
      {usableDays.length > 1 && (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-pressed={selected === null}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
              selected === null
                ? 'bg-primary text-primary-foreground'
                : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-manatee dark:hover:border-white'
            }`}
          >
            Tous
          </button>
          {usableDays.map((day) => {
            const active = selected === day.id;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => setSelected(day.id)}
                aria-pressed={active}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-stroke text-manatee hover:border-black dark:border-strokedark dark:text-manatee dark:hover:border-white'
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stroke px-6 py-12 text-center dark:border-strokedark">
          <span className="flex size-12 items-center justify-center rounded-full border border-primary/40 text-primary">
            <Clock className="size-5" />
          </span>
          <p className="text-base font-semibold">
            {sorted.length === 0
              ? 'Programme bientôt disponible'
              : 'Rien d’annoncé pour cette journée'}
          </p>
          <p className="max-w-md text-sm text-waterloo dark:text-manatee">
            {sorted.length === 0
              ? 'Le déroulé heure par heure est en cours de finalisation. Revenez très vite.'
              : 'Les autres journées ont déjà leur déroulé — changez d’onglet pour le consulter.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-2xl border border-stroke p-5 dark:border-strokedark sm:flex-row sm:gap-6"
            >
              <div className="shrink-0 text-xs font-bold uppercase tracking-wide text-accent-terracotta dark:text-accent-terracotta-dark sm:w-40">
                {new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(entry.startsAt))}
              </div>
              <div>
                <div className="font-semibold md:text-lg">{entry.title}</div>
                {entry.description && (
                  <div className="mt-1 text-sm text-waterloo dark:text-manatee">
                    {entry.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
