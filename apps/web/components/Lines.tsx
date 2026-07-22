import React from "react";

type LineConfig = {
  /** Position en % le long de l'axe perpendiculaire au mouvement. */
  offset: number;
  /** Durée d'une traversée complète, en secondes. */
  duration: number;
  /** Délai négatif (s) pour désynchroniser les lignes entre elles au chargement. */
  delay: number;
};

// Offsets/délais volontairement irréguliers (pas de Math.random() : on garde
// un rendu déterministe pour éviter tout mismatch d'hydratation SSR/client)
// pour obtenir un effet de grille organique plutôt qu'un quadrillage figé.
const HORIZONTAL_LINES: LineConfig[] = [
  { offset: 8, duration: 7, delay: -1 },
  { offset: 24, duration: 11, delay: -4.5 },
  { offset: 43, duration: 6, delay: -2 },
  { offset: 67, duration: 13, delay: -8 },
  { offset: 88, duration: 9, delay: -3.5 },
];

const VERTICAL_LINES: LineConfig[] = [
  { offset: 6, duration: 9, delay: -3 },
  { offset: 19, duration: 6, delay: -1 },
  { offset: 34, duration: 12, delay: -7 },
  { offset: 52, duration: 8, delay: -4.5 },
  { offset: 71, duration: 14, delay: -9 },
  { offset: 90, duration: 10, delay: -2 },
];

function HorizontalLine({ offset, duration, delay }: LineConfig) {
  return (
    <span
      className="absolute left-0 h-px w-full overflow-hidden bg-stroke dark:bg-strokedark"
      style={{ top: `${offset}%` }}
    >
      <span
        className="animate-line-x absolute left-0 top-0 h-full w-32 bg-linear-to-r from-transparent via-primary to-transparent"
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
      />
    </span>
  );
}

function VerticalLine({ offset, duration, delay }: LineConfig) {
  return (
    <span
      className="absolute top-0 h-full w-px overflow-hidden bg-stroke dark:bg-strokedark"
      style={{ left: `${offset}%` }}
    >
      <span
        className="animate-line-y absolute left-0 top-0 h-32 w-full bg-linear-to-b from-transparent via-primary to-transparent"
        style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
      />
    </span>
  );
}

const Lines = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 opacity-50 dark:opacity-30"
    >
      {HORIZONTAL_LINES.map((line) => (
        <HorizontalLine key={`h-${line.offset}`} {...line} />
      ))}
      {VERTICAL_LINES.map((line) => (
        <VerticalLine key={`v-${line.offset}`} {...line} />
      ))}
    </div>
  );
};

export default Lines;
