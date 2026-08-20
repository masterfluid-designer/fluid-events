'use client';

import { useEffect, useRef, useState } from 'react';
import type { TimelineEntry } from '@saas-events/types';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * TimelineStrip — bloc « Frise / Héritage » (storytelling).
 *
 * Refonte 2026-08-20 : le bloc ne portait qu'une suite de jalons. Il accueille
 * désormais un visuel et un récit, et chaque élément s'active séparément — un
 * organisateur qui n'a pas d'image ne doit pas se voir imposer un cadre vide,
 * et celui qui n'a qu'une photo ne doit pas devoir inventer trois jalons.
 *
 * La ligne se remplit à l'entrée dans le viewport, et les jalons s'allument
 * l'un après l'autre. Le remplissage n'est pas décoratif : il dit combien de
 * chemin la frise couvre, et attire l'œil de gauche à droite dans le sens de
 * la lecture — une frise statique se parcourt rarement jusqu'au bout.
 */
export function TimelineStrip({
  entries,
  title,
  eyebrow,
  imageUrl,
  text,
  showImage = true,
  showText = true,
  showTimeline = true,
}: {
  entries: TimelineEntry[];
  title?: string;
  eyebrow?: string;
  imageUrl?: string | null;
  text?: string | null;
  showImage?: boolean;
  showText?: boolean;
  showTimeline?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lance, setLance] = useState(false);

  const image = showImage ? imageUrl?.trim() : '';
  const recit = showText ? text?.trim() : '';
  const jalons = showTimeline ? entries : [];

  useEffect(() => {
    const noeud = ref.current;
    if (!noeud) return;

    // Mouvement coupé : la ligne est rendue pleine d'emblée. Une frise à moitié
    // remplie qui ne bougerait jamais serait un bug, pas une préférence.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setLance(true);
      return;
    }

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          setLance(true);
          observateur.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observateur.observe(noeud);
    return () => observateur.disconnect();
  }, []);

  // Rien à montrer : on ne rend pas une section avec un titre orphelin.
  if (!image && !recit && jalons.length === 0) return null;

  return (
    <SectionShell tone="muted">
      <SectionHeading eyebrow={eyebrow?.trim() || 'Notre héritage'} title={title || 'Notre histoire'} />

      {(image || recit) && (
        <div
          className={`mb-12 grid items-center gap-8 md:gap-10 ${
            image && recit ? 'lg:grid-cols-2' : ''
          }`}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="aspect-[4/3] w-full rounded-3xl object-cover shadow-solid-2"
            />
          )}
          {recit && (
            // `whitespace-pre-line` : l'organisateur saisit son récit en
            // paragraphes, ils doivent le rester à l'affichage.
            <p className="whitespace-pre-line text-base leading-relaxed text-waterloo dark:text-manatee md:text-lg">
              {recit}
            </p>
          )}
        </div>
      )}

      {jalons.length > 0 && (
        <div ref={ref} className="-mx-1 flex gap-6 overflow-x-auto px-1 pb-3 md:gap-8">
          {jalons.map((entry, index) => (
            <div key={entry.id} className="relative min-w-56 flex-1 pt-8 md:min-w-64">
              {/* Rail au repos — il montre le chemin qui reste à parcourir. */}
              <div
                className={`absolute top-2.5 h-px bg-stroke dark:bg-strokedark ${
                  index === 0 ? 'left-1/2' : 'left-0'
                } ${index === jalons.length - 1 ? 'right-1/2' : 'right-0'}`}
                aria-hidden="true"
              />

              {/*
                Barre de progression, posée SUR le rail. Elle s'étire depuis la
                gauche via `scaleX` — animer la largeur forcerait un recalcul de
                mise en page à chaque image, `transform` reste sur le GPU.

                Le décalage par jalon fait courir le remplissage de gauche à
                droite au lieu de tout allumer d'un coup.
              */}
              <div
                className={`absolute top-2.5 h-[2px] origin-left bg-primary transition-transform duration-700 ease-out ${
                  index === 0 ? 'left-1/2' : 'left-0'
                } ${index === jalons.length - 1 ? 'right-1/2' : 'right-0'} ${
                  lance ? 'scale-x-100' : 'scale-x-0'
                }`}
                style={{ transitionDelay: `${index * 160}ms` }}
                aria-hidden="true"
              />

              <div
                className={`absolute left-1/2 top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-white transition-all duration-500 dark:border-blackho ${
                  lance
                    ? 'scale-100 bg-primary shadow-[0_0_0_5px_color-mix(in_oklab,var(--color-primary)_22%,transparent)]'
                    : 'scale-75 bg-stroke dark:bg-strokedark'
                }`}
                style={{ transitionDelay: `${index * 160 + 120}ms` }}
                aria-hidden="true"
              />

              <div
                className={`rounded-2xl border border-stroke bg-white p-5 text-center transition-all duration-500 dark:border-strokedark dark:bg-blacksection ${
                  lance ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                }`}
                style={{ transitionDelay: `${index * 160 + 180}ms` }}
              >
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
      )}
    </SectionShell>
  );
}
