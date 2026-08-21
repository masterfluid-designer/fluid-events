'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
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
 * La progression est LIÉE AU DÉFILEMENT (modèle validé le 2026-08-20) : un
 * curseur court le long du rail au rythme de la page et termine sa course sur
 * le dernier jalon. Le remplissage n'est pas décoratif — il dit combien de
 * chemin la frise couvre, et le lecteur garde la main sur son rythme, ce qu'une
 * animation déclenchée une fois pour toutes lui retire.
 *
 * Rien ici ne redessine la section : le défilement écrit UNE variable CSS sur
 * le conteneur (`--frise-p`), et le reste — rail, curseur, jalons, cartes — en
 * découle en CSS pur (voir globals.css). Passer par un état React ferait
 * repasser React sur toute la frise à chaque pixel parcouru.
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
  const conteneur = useRef<HTMLDivElement | null>(null);
  const anneaux = useRef<Array<HTMLSpanElement | null>>([]);

  const image = showImage ? imageUrl?.trim() : '';
  const recit = showText ? text?.trim() : '';
  const jalons = showTimeline ? entries : [];
  const nb = jalons.length;

  useEffect(() => {
    const noeud = conteneur.current;
    if (!noeud || nb === 0) return;

    // Mouvement coupé : la feuille de style force déjà la frise à l'arrivée.
    // Écrire la variable ici l'écraserait — on ne s'abonne donc à rien.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    /*
     * Le rail va d'un CENTRE d'anneau à l'autre, jamais d'un bord à l'autre du
     * conteneur : sans cette mesure il dépasserait des jalons, et le curseur
     * finirait sa course dans le vide au lieu de se poser sur le dernier.
     *
     * Les deux axes sont mesurés à chaque fois : le composant ignore lequel la
     * feuille de style utilise (vertical au mobile, horizontal au-delà).
     */
    function mesurer() {
      const premier = anneaux.current[0];
      const dernier = anneaux.current[nb - 1];
      if (!noeud || !premier || !dernier) return;
      noeud.style.setProperty('--fx-a', `${premier.offsetLeft + premier.offsetWidth / 2}px`);
      noeud.style.setProperty('--fx-b', `${dernier.offsetLeft + dernier.offsetWidth / 2}px`);
      noeud.style.setProperty('--fy-a', `${premier.offsetTop + premier.offsetHeight / 2}px`);
      noeud.style.setProperty('--fy-b', `${dernier.offsetTop + dernier.offsetHeight / 2}px`);
    }

    let enAttente = false;
    function progresser() {
      enAttente = false;
      if (!noeud) return;
      const rect = noeud.getBoundingClientRect();
      const hauteur = window.innerHeight;

      /*
       * La course démarre quand la frise atteint le quatre-cinquièmes bas de
       * l'écran, et s'achève quand son bas remonte à 40 % de la hauteur — donc
       * pendant qu'elle est lue, et non après être sortie par le haut.
       */
      const course = rect.height + hauteur * 0.4;
      const parcouru = hauteur * 0.8 - rect.top;
      const p = Math.min(1, Math.max(0, parcouru / course));
      noeud.style.setProperty('--frise-p', p.toFixed(4));
    }

    // Une image par événement au plus : le défilement peut émettre bien plus
    // souvent que l'écran ne se rafraîchit, et rien ne sert de calculer entre
    // deux images.
    function planifier() {
      if (enAttente) return;
      enAttente = true;
      requestAnimationFrame(progresser);
    }

    /*
     * Le redimensionnement doit REMESURER, pas seulement recalculer : passer
     * du bureau au mobile fait basculer la frise de l'horizontale à la
     * verticale, et les anneaux changent complètement de place. Se contenter
     * de `planifier` laisserait le rail calé sur la géométrie précédente —
     * en pratique, un rail de hauteur nulle après une rotation d’écran.
     */
    function remesurer() {
      mesurer();
      planifier();
    }

    mesurer();
    progresser();

    window.addEventListener('scroll', planifier, { passive: true });
    window.addEventListener('resize', remesurer, { passive: true });

    // Les cartes changent de hauteur quand les polices arrivent ou que la
    // largeur change : sans cette observation, le rail resterait calé sur la
    // géométrie du premier rendu.
    const observateur = new ResizeObserver(remesurer);
    observateur.observe(noeud);

    return () => {
      window.removeEventListener('scroll', planifier);
      window.removeEventListener('resize', remesurer);
      observateur.disconnect();
    };
  }, [nb]);

  // Rien à montrer : on ne rend pas une section avec un titre orphelin.
  if (!image && !recit && nb === 0) return null;

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

      {nb > 0 && (
        <div ref={conteneur} className="frise relative">
          {/*
            Sans JavaScript, aucune progression n'est jamais écrite. La règle
            ci-dessous rend alors la frise pleine — une frise vide et immobile
            passerait pour une page cassée.
          */}
          <noscript>
            <style
              dangerouslySetInnerHTML={{ __html: '.frise{--frise-p:1 !important}.frise-curseur{display:none}' }}
            />
          </noscript>

          <div className="frise-rail" aria-hidden="true" />
          <div className="frise-rail-rempli" aria-hidden="true" />
          <div className="frise-curseur" aria-hidden="true" />

          <ol className="flex flex-col gap-7 md:flex-row md:items-stretch md:gap-0">
            {jalons.map((entry, index) => {
              const dernier = index === nb - 1;
              return (
                <li
                  key={entry.id}
                  className="grid flex-1 grid-cols-[1.5rem_1fr] items-start gap-x-4 md:grid-cols-1 md:grid-rows-[1fr_auto_1fr] md:gap-x-0 md:px-3"
                  // Position du jalon sur la course, posée une fois. C'est ce
                  // seuil que le CSS compare à la progression.
                  style={{ '--s': nb > 1 ? (index / (nb - 1)).toFixed(4) : '0' } as CSSProperties}
                >
                  <span
                    ref={(el) => {
                      anneaux.current[index] = el;
                    }}
                    aria-hidden="true"
                    className="col-start-1 row-start-1 grid size-[1.125rem] place-items-center rounded-full border-2 border-current bg-alabaster dark:bg-blacksection md:col-start-1 md:row-start-2 md:justify-self-center"
                  >
                    <span className="frise-pastille size-1.5 rounded-full bg-primary" />
                  </span>

                  <div
                    className={`frise-carte col-start-2 row-start-1 rounded-2xl border p-4 shadow-solid-3 md:col-start-1 md:text-center ${
                      index % 2 === 0
                        ? 'md:row-start-3 md:mt-5 md:self-start'
                        : 'md:row-start-1 md:mb-5 md:self-end'
                    } ${
                      // Le dernier jalon EST l'événement : il porte l'accent,
                      // comme le bouton d'achat. C'est l'aboutissement de
                      // l'histoire que la frise raconte.
                      dernier
                        ? 'accent-band border-transparent text-white'
                        : 'border-stroke bg-white dark:border-strokedark dark:bg-blacksection'
                    }`}
                  >
                    <div className="font-event text-base leading-tight md:text-lg">{entry.label}</div>
                    {entry.date && (
                      <div
                        className={`mt-1 text-sm font-semibold ${
                          dernier ? 'text-white/85' : 'text-primary'
                        }`}
                      >
                        {entry.date}
                      </div>
                    )}
                    {entry.description && (
                      <p
                        className={`mt-2 text-xs leading-relaxed ${
                          dernier ? 'text-white/80' : 'text-waterloo dark:text-manatee'
                        }`}
                      >
                        {entry.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </SectionShell>
  );
}
