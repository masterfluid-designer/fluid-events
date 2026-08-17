'use client';

import { useEffect, useState } from 'react';
import { SectionShell } from './section-shell';
import { SectionEyebrow } from './section-eyebrow';

/**
 * Countdown — Bloc "compte à rebours" (décision produit 2026-07-13) :
 * prend uniquement la date de début de l'événement en entrée et décompte
 * automatiquement, jamais de date configurée manuellement par bloc.
 *
 * Présentation en gros chiffres encadrés (pattern orncity "AVANT LE COUP
 * D'ENVOI").
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

function Digits({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-stroke bg-white py-5 dark:border-strokedark dark:bg-blacksection md:py-7">
      <span className="font-event text-3xl leading-none tabular-nums md:text-5xl lg:text-6xl">{value}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-waterloo dark:text-manatee md:text-xs">
        {label}
      </span>
    </div>
  );
}

export function Countdown({ targetDate, dateLabel }: { targetDate: string; dateLabel?: string }) {
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

  const labels = ['Jours', 'Heures', 'Min', 'Sec'];

  if (!time) {
    return (
      <SectionShell tone="muted">
        <div className="text-center font-event text-2xl md:text-3xl">L&apos;événement a commencé !</div>
      </SectionShell>
    );
  }

  const values =
    time === 'pending'
      ? ['--', '--', '--', '--']
      : [time.days, time.hours, time.minutes, time.seconds].map((v) => String(v).padStart(2, '0'));

  return (
    <SectionShell tone="muted">
      <div className="mb-6 flex flex-col items-center text-center">
        <SectionEyebrow>Avant le coup d&apos;envoi</SectionEyebrow>
        {dateLabel && (
          <p className="mt-2 text-sm text-waterloo dark:text-manatee md:text-base">
            Rendez-vous le {dateLabel}
          </p>
        )}
      </div>
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-2.5 md:gap-4">
        {values.map((value, i) => (
          <Digits key={labels[i]} value={value} label={labels[i]} />
        ))}
      </div>
    </SectionShell>
  );
}
