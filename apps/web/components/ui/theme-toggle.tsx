'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ThemeToggle — bascule clair/sombre réutilisable partout dans l'app
 * (décision produit 2026-07-15 : le contrôle existait déjà sur les pages
 * publiques marketing (`components/Header/ThemeToggler.tsx`, positionnement
 * absolu propre à ce header) mais nulle part ailleurs — dashboards
 * admin/manager/client, page événement publique). Basé sur les mêmes
 * primitives shadcn/ui (`Button` ghost/icon) que le reste du design system,
 * plutôt qu'un composant à part avec ses propres images.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // `theme` reste "system" tant que l'utilisateur n'a jamais basculé
  // explicitement (défaut du provider, voir theme-provider.tsx) — comparer
  // `theme === 'dark'` restait donc bloqué sur l'icône "clair" (et le clic
  // rebasculait sur le même thème système déjà affiché, sans effet visible)
  // tant que le système était en dark. `resolvedTheme` donne le thème
  // RÉELLEMENT appliqué (jamais "system"), c'est lui qu'il faut lire — même
  // logique déjà utilisée par le raccourci clavier 'd' (ThemeHotkey).
  const { resolvedTheme, setTheme } = useTheme();
  // `next-themes` ne connaît le thème réel qu'après hydratation (SSR ne sait
  // pas ce que le navigateur avait en localStorage) — éviter un flash/mismatch
  // en ne rendant l'icône qu'une fois monté côté client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={resolvedTheme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={className}
    >
      {mounted && resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
