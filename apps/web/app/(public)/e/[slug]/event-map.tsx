'use client';

import dynamic from 'next/dynamic';
import type { MapVenue } from './event-map-canvas';

/**
 * Enveloppe cliente de la carte. Leaflet lit `window` à l'import : la toile
 * doit donc être chargée UNIQUEMENT dans le navigateur (`ssr: false`), ce que
 * Next.js n'autorise pas depuis un composant serveur — d'où ce fichier
 * intermédiaire marqué 'use client', que `event-location.tsx` (serveur) peut
 * importer sans rien savoir de tout ça.
 */
const EventMapCanvas = dynamic(() => import('./event-map-canvas'), {
  ssr: false,
  // Le substitut occupe EXACTEMENT la place de la carte : sans lui, la colonne
  // s'effondre puis se rouvre au chargement, et toute la section sursaute.
  loading: () => (
    <div className="size-full animate-pulse bg-black/[0.06] dark:bg-white/[0.06]" />
  ),
});

export type { MapVenue };

export function EventMap({ venues }: { venues: MapVenue[] }) {
  return <EventMapCanvas venues={venues} />;
}
