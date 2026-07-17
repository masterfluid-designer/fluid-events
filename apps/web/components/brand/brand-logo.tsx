'use client';

import { usePlatformSettings } from '@/lib/use-platform-settings';
import { cn } from '@/lib/utils';

/**
 * BrandLogo / BrandIcon — logo et icône SVG de la plateforme, configurables
 * par le Super Admin (page /admin/branding, 2026-07-17). Rendu inline
 * (dangerouslySetInnerHTML — contenu déjà assaini côté API à l'écriture,
 * jamais de SVG brut non filtré ne transite par ici) plutôt qu'un <img>, pour
 * que le filtre `dark:img-white` (globals.css) s'applique quelle que soit la
 * couleur d'origine du SVG uploadé : il devient blanc en mode sombre, quel
 * qu'il soit — décision produit explicite.
 *
 * Repli : texte "Fluid Events" (logo) ou le `fallback` fourni par l'appelant
 * (icône) tant que rien n'est configuré — jamais un état vide/cassé.
 */
export function BrandLogo({ className }: { className?: string }) {
  const { data } = usePlatformSettings();

  if (data?.logoSvg) {
    return (
      <span
        className={cn('inline-flex items-center [&_svg]:h-full [&_svg]:w-auto dark:img-white', className)}
        dangerouslySetInnerHTML={{ __html: data.logoSvg }}
      />
    );
  }

  return <span className={cn('font-bold', className)}>Fluid Events</span>;
}

export function BrandIcon({
  className,
  fallback,
}: {
  className?: string;
  fallback: React.ReactNode;
}) {
  const { data } = usePlatformSettings();

  if (data?.iconSvg) {
    return (
      <span
        className={cn('inline-flex items-center justify-center [&_svg]:size-full dark:img-white', className)}
        dangerouslySetInnerHTML={{ __html: data.iconSvg }}
      />
    );
  }

  return <>{fallback}</>;
}
