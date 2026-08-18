'use client';

import { Check, RotateCcw } from 'lucide-react';
import {
  MAX_BACKGROUND_OVERLAY,
  MIN_BACKGROUND_OVERLAY,
  type EventTheme,
} from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { DEFAULT_EVENT_FONT, EVENT_FONT_LIST } from '@/lib/event-fonts';

/** Voile posé au premier dépôt d'une image — confortable, et au-dessus du plancher. */
const DEFAULT_BACKGROUND_OVERLAY = 55;

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
  // Le curseur affiche la valeur RÉELLEMENT appliquée, plancher compris : le
  // laisser descendre visuellement sous un minimum que le rendu ignore
  // donnerait un réglage qui ment.
  const overlay = Math.min(
    MAX_BACKGROUND_OVERLAY,
    Math.max(MIN_BACKGROUND_OVERLAY, theme.backgroundOverlay ?? DEFAULT_BACKGROUND_OVERLAY),
  );

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

      {/*
        Image de fond (2026-08-18) — décor de TOUTE la page publique, à ne pas
        confondre avec l'image de couverture de l'événement, qui illustre le
        hero et les partages.
      */}
      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Image de fond
        </div>

        <ImageUploadField
          label="Fond de la page publique"
          value={theme.backgroundImageUrl}
          onChange={(backgroundImageUrl) =>
            onChange({
              // Chaîne vide et non `undefined` : c'est ce que le backend
              // reconnaît comme le geste « retirer », `undefined` disparaîtrait
              // du JSON et laisserait l'ancienne image en place.
              backgroundImageUrl: backgroundImageUrl ?? '',
              // Premier dépôt : on pose un voile lisible d'emblée plutôt que
              // de laisser l'organisateur découvrir sa page illisible.
              backgroundOverlay: theme.backgroundOverlay ?? DEFAULT_BACKGROUND_OVERLAY,
            })
          }
        />

        {theme.backgroundImageUrl && (
          <>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <span className="flex items-center justify-between gap-3">
                <span>Assombrissement</span>
                <span className="font-semibold tabular-nums text-foreground">{overlay}%</span>
              </span>
              <input
                type="range"
                min={MIN_BACKGROUND_OVERLAY}
                max={MAX_BACKGROUND_OVERLAY}
                step={5}
                value={overlay}
                onChange={(e) => onChange({ backgroundOverlay: Number(e.target.value) })}
                className="accent-primary"
              />
              <span className="text-[11px] leading-relaxed">
                Le minimum de {MIN_BACKGROUND_OVERLAY}% n&apos;est pas réglable : sans lui, une
                affiche claire rendrait le texte de la page illisible.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={theme.backgroundBlur === true}
                onChange={(e) => onChange({ backgroundBlur: e.target.checked })}
                className="mt-0.5 accent-primary"
              />
              <span>
                Flouter le fond
                <span className="mt-0.5 block text-[11px] leading-relaxed">
                  Utile pour une affiche chargée : les détails s&apos;effacent, l&apos;ambiance
                  reste.
                </span>
              </span>
            </label>
          </>
        )}
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
            // Chaîne vide, pas `undefined` : « revenir au défaut » doit
            // RETIRER l'image, or une clé absente laisserait celle en base.
            backgroundImageUrl: '',
            backgroundOverlay: undefined,
            backgroundBlur: undefined,
          })
        }
      >
        <RotateCcw className="size-3.5" /> Revenir au thème par défaut
      </Button>
    </div>
  );
}
