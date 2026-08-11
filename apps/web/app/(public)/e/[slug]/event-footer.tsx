import Link from 'next/link';
import type { NavItem } from './block-renderer';

/**
 * EventFooter — Footer contextuel à l'ÉVÉNEMENT (pas le footer marketing du
 * SaaS, `components/Footer/index.tsx`, qui reste utilisé sur les pages
 * `/`, `/contact`, etc.). Équivalent condensé du footer d'orncity : marque de
 * l'événement + liens rapides vers les mêmes sections que la nav en ancre.
 */
export function EventFooter({
  eventTitle,
  location,
  navItems,
}: {
  eventTitle: string;
  location: string | null;
  navItems: NavItem[];
}) {
  return (
    <footer className="mx-auto max-w-190 border-t border-stroke px-6 py-8 dark:border-strokedark md:px-9">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-serif text-lg font-semibold">{eventTitle}</div>
          {location && <div className="mt-1 text-sm text-manatee dark:text-waterloo">{location}</div>}
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="text-manatee transition-colors hover:text-black dark:text-waterloo dark:hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <Link
            href="/billets-perdus"
            className="text-manatee transition-colors hover:text-black dark:text-waterloo dark:hover:text-white"
          >
            J'ai perdu mes billets
          </Link>
        </nav>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-stroke pt-4 text-xs text-manatee dark:border-strokedark dark:text-waterloo">
        <span>Billetterie propulsée par Fluid Events.</span>
        <Link href="/" className="hover:text-black dark:hover:text-white">
          fluidevents.africa
        </Link>
      </div>
    </footer>
  );
}
