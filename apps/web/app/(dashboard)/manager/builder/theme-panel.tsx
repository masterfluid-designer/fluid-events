'use client';

import { Check, RotateCcw } from 'lucide-react';
import type { EventTheme } from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { DEFAULT_EVENT_FONT, EVENT_FONT_LIST } from '@/lib/event-fonts';

/**
 * ThemePanel — onglet "Thème" du Builder (décision produit : chaque
 * organisateur choisit la police et les couleurs de SA page publique, plutôt
 * qu'une identité unique imposée à tous les clients du SaaS).
 *
 * L'état est possédé par le parent (`page.tsx`) et parti avec les blocs dans
 * la même sauvegarde (même verrou de concurrence optimiste) — même schéma que
 * ConfigPanel.
 */
export function ThemePanel({
  theme,
  onChange,
}: {
  theme: EventTheme;
  onChange: (patch: Partial<EventTheme>) => void;
}) {
  const activeFont = theme.fontFamily ?? DEFAULT_EVENT_FONT;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Police des titres
        </div>
        <div className="flex flex-col gap-2">
          {EVENT_FONT_LIST.map((font) => {
            const active = font.key === activeFont;
            return (
              <button
                key={font.key}
                type="button"
                onClick={() => onChange({ fontFamily: font.key })}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
                }`}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-lg leading-tight ${font.className}`}>
                    {font.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {font.hint}
                  </span>
                </span>
                {active && <Check className="size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Couleurs
        </div>
        <ColorField
          label="Couleur d'accent (boutons, badges)"
          value={theme.accentColor}
          onChange={(accentColor) => onChange({ accentColor })}
        />
        <ColorField
          label="Fond de page"
          value={theme.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Le texte des boutons passe automatiquement en noir ou blanc selon la couleur choisie,
          pour rester lisible.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          onChange({
            fontFamily: undefined,
            accentColor: undefined,
            backgroundColor: undefined,
          })
        }
      >
        <RotateCcw className="size-3.5" /> Revenir au thème par défaut
      </Button>
    </div>
  );
}
