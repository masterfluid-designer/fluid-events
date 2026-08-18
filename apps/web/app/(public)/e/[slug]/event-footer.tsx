import Link from 'next/link';
import { CalendarDays, MapPin } from 'lucide-react';
import type { NavItem } from './block-renderer';

/**
 * EventFooter — Footer contextuel à l'ÉVÉNEMENT (pas le footer marketing du
 * SaaS, `components/Footer/index.tsx`, qui reste utilisé sur `/`, `/contact`,
 * etc.). Structure multi-colonnes reprise d'orncity : identité de l'événement
 * à gauche, informations pratiques et liens rapides en colonnes.
 */
export function EventFooter({
  eventTitle,
  location,
  dateLabel,
  navItems,
}: {
  eventTitle: string;
  location: string | null;
  dateLabel: string;
  navItems: NavItem[];
}) {
  return (
    <footer className="border-t border-stroke bg-black/[0.035] px-5 py-12 dark:border-strokedark dark:bg-white/[0.035] md:px-8 md:py-16">
      <div className="mx-auto max-w-6xl">
        {/* Pied de page centré (2026-08-18). La grille asymétrique tirait le
            titre à gauche et les deux listes vers la droite, laissant un vide
            au milieu sur grand écran. Tout s'aligne désormais sur l'axe
            central, ce qui tient aussi bien à 375 px qu'à 1440. */}
        <div className="flex flex-col items-center gap-10 text-center">
          <div>
            <div className="font-event text-2xl md:text-3xl">{eventTitle}</div>
            <p className="mx-auto mt-3 max-w-sm text-sm text-waterloo dark:text-manatee">
              Billetterie officielle — réservation en ligne, billet numérique à présenter à
              l&apos;entrée.
            </p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-waterloo dark:text-manatee">
              Informations
            </div>
            <ul className="mt-4 flex flex-col items-center gap-3 text-sm">
              <li className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-terracotta dark:text-accent-terracotta-dark" />
                <span>{dateLabel}</span>
              </li>
              {location && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-accent-terracotta dark:text-accent-terracotta-dark" />
                  <span>{location}</span>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-waterloo dark:text-manatee">
              Navigation
            </div>
            {/* Liens en ligne et non en colonne : quatre entrées centrées
                l'une sous l'autre étireraient le pied de page sans raison. */}
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
              {navItems.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-waterloo transition-colors hover:text-black dark:text-manatee dark:hover:text-white"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/billets-perdus"
                  className="text-waterloo transition-colors hover:text-black dark:text-manatee dark:hover:text-white"
                >
                  J&apos;ai perdu mes billets
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-stroke pt-6 text-center text-xs text-manatee dark:border-strokedark dark:text-manatee sm:flex-row sm:justify-center sm:gap-4">
          <span>Billetterie propulsée par Fluid Events.</span>
          <Link href="/" className="transition-colors hover:text-black dark:hover:text-white">
            fluidevents.africa
          </Link>
        </div>
      </div>
    </footer>
  );
}
