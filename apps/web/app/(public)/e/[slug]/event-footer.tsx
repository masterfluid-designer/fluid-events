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
    <footer className="border-t border-stroke bg-alabaster px-5 py-12 dark:border-strokedark dark:bg-blackho md:px-8 md:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="font-serif text-2xl md:text-3xl">{eventTitle}</div>
            <p className="mt-3 max-w-sm text-sm text-waterloo dark:text-manatee">
              Billetterie officielle — réservation en ligne, billet numérique à présenter à
              l&apos;entrée.
            </p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-manatee dark:text-waterloo">
              Informations
            </div>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
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
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-manatee dark:text-waterloo">
              Navigation
            </div>
            <ul className="mt-4 flex flex-col gap-2.5 text-sm">
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

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stroke pt-6 text-xs text-manatee dark:border-strokedark dark:text-waterloo">
          <span>Billetterie propulsée par Fluid Events.</span>
          <Link href="/" className="transition-colors hover:text-black dark:hover:text-white">
            fluidevents.africa
          </Link>
        </div>
      </div>
    </footer>
  );
}
