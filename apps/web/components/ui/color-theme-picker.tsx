'use client';

import { Check } from 'lucide-react';
import { useColorTheme } from '@/components/color-theme-provider';
import { COLOR_THEMES } from '@/lib/color-themes';
import { cn } from '@/lib/utils';

/**
 * ColorThemePicker — grille des 6 thèmes de couleur (page Apparence).
 * Chaque carte applique le thème instantanément au clic (pas de bouton
 * "Enregistrer" séparé — même logique immédiate que le bouton clair/sombre).
 */
export function ColorThemePicker() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {COLOR_THEMES.map((theme) => {
        const active = colorTheme === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setColorTheme(theme.id)}
            aria-pressed={active}
            className={cn(
              'flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors',
              active
                ? 'border-primary ring-1 ring-primary'
                : 'border-border hover:border-primary/50',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex -space-x-1.5">
                {theme.swatches.map((color, i) => (
                  <span
                    key={i}
                    className="size-6 rounded-full border-2 border-card"
                    style={{ background: color }}
                  />
                ))}
              </div>
              {active && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
              )}
            </div>
            <div>
              <p className="font-serif text-base leading-tight">{theme.label}</p>
              <p className="text-xs text-muted-foreground">{theme.tag}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
