'use client';

import { useState } from 'react';
import { Menu, Ticket, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { NavItem } from './block-renderer';

/**
 * EventHeader — en-tête de la page publique d'un événement (refonte "haute
 * fidélité orncity"). Toujours présent, jamais un bloc du Builder (décision
 * produit 2026-07-13).
 *
 * Responsive : la nav complète s'affiche à partir de `lg`, en dessous elle
 * bascule dans un panneau plein écran ouvert par le bouton hamburger — les
 * liens d'ancre y sont cliquables puis referment le panneau.
 *
 * ⚠️ Le panneau mobile est rendu en FRÈRE du <header>, jamais à l'intérieur :
 * `backdrop-blur` sur le header crée un bloc conteneur pour les descendants
 * `position: fixed` (au même titre que `transform`/`filter`), ce qui
 * confinerait le panneau à la hauteur du header — bug réel rencontré, le
 * contenu de la page transparaissait derrière le menu.
 */
export function EventHeader({
  eventTitle,
  logoUrl,
  slug,
  navItems,
}: {
  eventTitle: string;
  logoUrl: string | null;
  slug: string;
  navItems: NavItem[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ticketsAnchor = navItems.find((item) => item.id === 'block-tickets');

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stroke bg-white/85 backdrop-blur-md dark:border-strokedark dark:bg-blackho/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:h-18 md:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
            ) : null}
            <span className="truncate font-event text-base font-semibold md:text-lg">{eventTitle}</span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-sm font-medium text-waterloo transition-colors hover:text-black dark:text-manatee dark:hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <a
              href={`/client?event=${encodeURIComponent(slug)}`}
              className="hidden rounded-full border border-stroke px-4 py-2 text-xs font-semibold transition-colors hover:border-black dark:border-strokedark dark:hover:border-white sm:inline-flex"
            >
              Mon ticket
            </a>
            {ticketsAnchor && (
              <a
                href={`#${ticketsAnchor.id}`}
                className="btn-accent inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold md:px-5"
              >
                Acheter <Ticket className="size-3.5" />
              </a>
            )}
            {navItems.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Ouvrir le menu"
                className="inline-flex size-9 items-center justify-center rounded-full border border-stroke dark:border-strokedark lg:hidden"
              >
                <Menu className="size-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] bg-white dark:bg-blackho lg:hidden">
          <div className="flex h-16 items-center justify-between px-5">
            <span className="truncate font-event text-base font-semibold">{eventTitle}</span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
              className="inline-flex size-9 items-center justify-center rounded-full border border-stroke dark:border-strokedark"
            >
              <X className="size-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 overflow-y-auto px-5 pb-8 pt-4">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setMenuOpen(false)}
                className="border-b border-stroke py-4 font-event text-2xl dark:border-strokedark"
              >
                {item.label}
              </a>
            ))}
            <a
              href={`/client?event=${encodeURIComponent(slug)}`}
              className="btn-accent mt-6 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold"
            >
              <Ticket className="size-4" /> Mon ticket
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
