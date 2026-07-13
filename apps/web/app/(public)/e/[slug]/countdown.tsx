'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown — Bloc "compte à rebours" (décision produit 2026-07-13) :
 * prend uniquement la date de début de l'événement en entrée et décompte
 * automatiquement, jamais de date configurée manuellement par bloc.
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

export function Countdown({ targetDate }: { targetDate: string }) {
  // `Date.now()` diffère entre le rendu serveur et l'hydratation client (même
  // de quelques centaines de ms) — initialiser l'état avec `remaining()` ferait
  // systématiquement diverger le HTML serveur du premier rendu client (erreur
  // d'hydratation Next.js). On rend un état stable ("--") identique des deux
  // côtés, puis on calcule/démarre le décompte uniquement après montage
  // (`useEffect` ne s'exécute jamais côté serveur).
  const [time, setTime] = useState<ReturnType<typeof remaining> | 'pending'>('pending');

  useEffect(() => {
    setTime(remaining(targetDate));
    const interval = setInterval(() => setTime(remaining(targetDate)), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (time === 'pending') {
    return (
      <div className="grid grid-cols-4 gap-2.5 px-6 py-6 md:px-9">
        {['Jours', 'Heures', 'Min', 'Sec'].map((label) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-xl border border-stroke bg-alabaster py-3 dark:border-strokedark dark:bg-blackho"
          >
            <span className="font-serif text-2xl tabular-nums md:text-3xl">--</span>
            <span className="text-[11px] uppercase tracking-[0.06em] text-manatee dark:text-waterloo">
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (!time) {
    return (
      <div className="px-6 py-6 text-center text-sm font-semibold md:px-9">L&apos;événement a commencé !</div>
    );
  }

  const units: Array<{ label: string; value: number }> = [
    { label: 'Jours', value: time.days },
    { label: 'Heures', value: time.hours },
    { label: 'Min', value: time.minutes },
    { label: 'Sec', value: time.seconds },
  ];

  return (
    <div className="grid grid-cols-4 gap-2.5 px-6 py-6 md:px-9">
      {units.map((unit) => (
        <div
          key={unit.label}
          className="flex flex-col items-center gap-1 rounded-xl border border-stroke bg-alabaster py-3 dark:border-strokedark dark:bg-blackho"
        >
          <span className="font-serif text-2xl tabular-nums md:text-3xl">
            {String(unit.value).padStart(2, '0')}
          </span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-manatee dark:text-waterloo">
            {unit.label}
          </span>
        </div>
      ))}
    </div>
  );
}
