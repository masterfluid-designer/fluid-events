'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LogOut, QrCode, Receipt, User } from 'lucide-react';
import { PublicSurface } from '@/components/public-surface';
import { BrandIcon } from '@/components/brand/brand-logo';
import { apiPost } from '@/lib/api';

/**
 * Espace client — volontairement HORS du gabarit des tableaux de bord
 * (décision produit 2026-08-17).
 *
 * Un acheteur n'est pas un exploitant : il arrive d'une page d'événement pour
 * consulter son billet, pas pour administrer quoi que ce soit. Il n'a donc ni
 * barre latérale ni palette de back-office, mais l'apparence de la page
 * publique — police et couleur de l'organisateur comprises quand `?event=`
 * désigne un événement précis.
 *
 * La navigation reste en en-tête, comme sur la page publique : trois liens
 * suffisent, une sidebar pour trois entrées volerait la moitié d'un écran de
 * téléphone.
 */

const LINKS = [
  { href: '/client', label: 'Mes billets', icon: QrCode },
  { href: '/client/orders', label: 'Mes commandes', icon: Receipt },
  { href: '/client/profile', label: 'Mon profil', icon: User },
];

function ClientHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Le contexte événement suit la navigation : sans cela, cliquer sur
  // « Mes commandes » ferait retomber la page sur l'apparence neutre.
  const eventSlug = searchParams.get('event');
  const suffix = eventSlug ? `?event=${encodeURIComponent(eventSlug)}` : '';

  return (
    <header className="sticky top-0 z-40 border-b border-stroke bg-white/90 backdrop-blur dark:border-strokedark dark:bg-blackho/90">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={eventSlug ? `/e/${eventSlug}` : '/'} className="flex items-center gap-2">
          <BrandIcon className="size-7" fallback={<QrCode className="size-6 text-primary" />} />
          <span className="font-event text-lg">Mon espace</span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={`${href}${suffix}`}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-manatee hover:bg-black/5 dark:text-manatee dark:hover:bg-white/5'
                }`}
              >
                <Icon className="size-4" />
                {/* Libellé masqué sur très petit écran : trois pastilles
                    d'icônes tiennent là où trois libellés déborderaient. */}
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Se déconnecter"
            onClick={async () => {
              await apiPost('/api/auth/logout', {}).catch(() => {});
              window.location.href = '/';
            }}
            className="ml-1 inline-flex size-9 items-center justify-center rounded-full text-manatee transition-colors hover:bg-black/5 dark:text-manatee dark:hover:bg-white/5"
          >
            <LogOut className="size-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}

function ClientShell({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();

  return (
    <PublicSurface eventSlug={searchParams.get('event')}>
      <ClientHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </PublicSurface>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  // `useSearchParams` impose une frontière Suspense — sans elle, tout l'espace
  // client basculerait en rendu dynamique.
  return (
    <Suspense fallback={null}>
      <ClientShell>{children}</ClientShell>
    </Suspense>
  );
}
