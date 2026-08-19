'use client';

import { useEffect, useState } from 'react';
import { SectionShell } from './section-shell';
import { SectionEyebrow } from './section-eyebrow';

/**
 * Countdown — Bloc « compte à rebours » (décision produit 2026-07-13, refonte
 * en anneaux 2026-08-19).
 *
 * Prend uniquement la date de début de l'événement en entrée et décompte
 * automatiquement : jamais de date configurée manuellement par bloc, qui
 * finirait par mentir dès que l'organisateur déplace son événement.
 *
 * Chaque unité est un anneau dont l'arc dit ce qui reste DANS SON CYCLE —
 * secondes sur 60, minutes sur 60, heures sur 24. L'arc n'est donc pas
 * décoratif : il tourne visiblement, et l'on voit le temps s'écouler même sans
 * lire les chiffres.
 */

function remaining(targetDate: string) {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Anneau d'une unité. `fraction` vaut 0 → arc vide, 1 → cercle complet.
 *
 * L'arc démarre en haut (`-rotate-90`) et tourne dans le sens horaire, comme
 * une horloge : un arc qui partirait de la droite se lirait à l'envers.
 */
function Ring({
  value,
  label,
  fraction,
}: {
  value: string;
  label: string;
  fraction: number;
}) {
  const offset = CIRCUMFERENCE * (1 - Math.min(Math.max(fraction, 0), 1));

  return (
    <div className="relative aspect-square w-full max-w-[7.5rem]">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          className="stroke-stroke dark:stroke-strokedark"
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          // L'accent de l'organisateur, pas une couleur écrite en dur : le
          // compte à rebours appartient à SA page.
          className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-linear"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary md:text-[10px]">
          {label}
        </span>
        <span className="font-event text-2xl font-black leading-none tabular-nums md:text-4xl">
          {value}
        </span>
      </div>
    </div>
  );
}

export function Countdown({ targetDate, dateLabel }: { targetDate: string; dateLabel?: string }) {
  // `Date.now()` diffère entre le rendu serveur et l'hydratation client (même
  // de quelques centaines de ms) — initialiser l'état avec `remaining()` ferait
  // systématiquement diverger le HTML serveur du premier rendu client (erreur
  // d'hydratation Next.js). On rend un état stable identique des deux côtés,
  // puis on calcule/démarre le décompte uniquement après montage
  // (`useEffect` ne s'exécute jamais côté serveur).
  const [time, setTime] = useState<ReturnType<typeof remaining> | 'pending'>('pending');

  useEffect(() => {
    setTime(remaining(targetDate));
    const interval = setInterval(() => setTime(remaining(targetDate)), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const started = time === null;
  const t = time === 'pending' || time === null ? null : time;

  const units = [
    {
      label: 'Jours',
      value: t ? t.days : 0,
      // Aucun cycle naturel pour les jours : on prend le dernier mois comme
      // repère. Au-delà l'anneau reste plein — dire « il reste beaucoup » est
      // la seule information juste à cette distance.
      fraction: t ? Math.min(t.days, 30) / 30 : 0,
    },
    { label: 'Heures', value: t ? t.hours : 0, fraction: t ? t.hours / 24 : 0 },
    { label: 'Min', value: t ? t.minutes : 0, fraction: t ? t.minutes / 60 : 0 },
    { label: 'Sec', value: t ? t.seconds : 0, fraction: t ? t.seconds / 60 : 0 },
  ];

  /**
   * La phrase s'adapte à la distance réelle. « Bientôt » à deux cents jours
   * serait faux, et « rendez-vous le… » la veille au soir n'apprendrait plus
   * rien : c'est le décompte qui parle à ce moment-là.
   */
  let caption: string;
  if (started) caption = 'L’événement a commencé !';
  else if (!t) caption = dateLabel ? `Rendez-vous le ${dateLabel}` : 'Le décompte est lancé';
  else if (t.days === 0) caption = 'C’est aujourd’hui !';
  else if (t.days < 7) caption = 'L’événement commence bientôt';
  else caption = dateLabel ? `Rendez-vous le ${dateLabel}` : 'Le décompte est lancé';

  return (
    <SectionShell tone="muted">
      <div className="mb-8 flex flex-col items-center text-center">
        <SectionEyebrow>Avant le coup d&apos;envoi</SectionEyebrow>
      </div>

      {/* Les anneaux restent affichés une fois l'événement commencé, à zéro :
          les retirer ferait sauter la section d'un coup, et la page perdrait
          son repère visuel au moment précis où le visiteur le cherche. */}
      <div className="mx-auto flex max-w-2xl items-start justify-center gap-3 md:gap-6">
        {units.map((u) => (
          <Ring
            key={u.label}
            label={u.label}
            value={time === 'pending' ? '--' : String(u.value).padStart(2, '0')}
            fraction={u.fraction}
          />
        ))}
      </div>

      <p className="mt-7 text-center font-event text-xl md:text-3xl">{caption}</p>
    </SectionShell>
  );
}
