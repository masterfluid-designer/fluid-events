'use client';

import { useState } from 'react';
import { Check, Moon, RotateCcw, SlidersHorizontal, Sun } from 'lucide-react';
import {
  MAX_BACKGROUND_OVERLAY,
  MIN_BACKGROUND_OVERLAY,
  type EventTheme,
} from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Input } from '@/components/ui/input';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { DEFAULT_EVENT_FONT, EVENT_FONT_LIST } from '@/lib/event-fonts';
import { deriveDarkAccent, deriveDarkBackground } from '@/lib/event-theme';

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
  navChoices = [],
}: {
  theme: EventTheme;
  onChange: (patch: Partial<EventTheme>) => void;
  /**
   * Entrées de menu réellement disponibles sur cette page — calculées depuis
   * les blocs posés. On ne propose pas de cacher ce qui n’existe pas.
   */
  navChoices?: Array<{ type: string; label: string }>;
}) {
  const activeFont = theme.fontFamily ?? DEFAULT_EVENT_FONT;

  // Ouvert d’emblée si une couleur sombre a déjà été fixée : sinon
  // l’organisateur ne reverrait pas son propre réglage en rouvrant le panneau.
  const [sombrePersonnalise, setSombrePersonnalise] = useState(
    Boolean(theme.accentColorDark || theme.accentColorSecondaryDark || theme.backgroundColorDark),
  );

  // Les MÊMES fonctions que le rendu public : l’aperçu ne peut pas diverger
  // de ce que la page affichera.
  const accentSombreCalcule = theme.accentColor ? deriveDarkAccent(theme.accentColor) : null;
  const accent2SombreCalcule = theme.accentColorSecondary
    ? deriveDarkAccent(theme.accentColorSecondary)
    : null;
  const fondSombreCalcule = theme.backgroundColor
    ? deriveDarkBackground(theme.backgroundColor)
    : null;
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
        {/*
          En-tête (2026-08-20). Rien n’y était réglable : logo, titre, entrées
          du menu et boutons vivaient en dur dans le composant. Un organisateur
          dont le logo disparaissait sur fond sombre n’avait aucun recours.
        */}
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          En-tête
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Texte de l’en-tête
          </label>
          <Input
            placeholder="Le titre de l’événement"
            value={theme.headerTitle ?? ''}
            onChange={(e) => onChange({ headerTitle: e.target.value })}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Laissez vide pour afficher le titre de l’événement.
          </p>
        </div>

        <ImageUploadField
          label="Logo (thème clair)"
          value={theme.headerLogoUrl || undefined}
          onChange={(url) => onChange({ headerLogoUrl: url ?? '' })}
        />
        {/* Un logo sombre sur fond sombre disparaît. Le second est facultatif :
            sans lui, le premier sert dans les deux thèmes, comme avant. */}
        <ImageUploadField
          label="Logo (thème sombre, optionnel)"
          value={theme.headerLogoUrlDark || undefined}
          onChange={(url) => onChange({ headerLogoUrlDark: url ?? '' })}
        />

        {navChoices.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Entrées affichées dans le menu
            </div>
            <div className="flex flex-col gap-1.5">
              {navChoices.map((choix) => {
                const masque = (theme.headerHiddenNav ?? []).includes(choix.type);
                return (
                  <label
                    key={choix.type}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!masque}
                      onChange={() =>
                        onChange({
                          headerHiddenNav: masque
                            ? (theme.headerHiddenNav ?? []).filter((t) => t !== choix.type)
                            : [...(theme.headerHiddenNav ?? []), choix.type],
                        })
                      }
                      className="size-4 rounded border-border"
                    />
                    {choix.label}
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Décocher retire l’entrée du menu seulement — la section reste sur la page, et
              le pied de page continue d’y mener.
            </p>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Boutons</div>
          <div className="flex flex-col gap-1.5">
            {(
              [
                ["headerShowBuy", "Bouton « Acheter »"],
                ["headerShowMyTicket", "Bouton « Mon ticket »"],
                ["headerShowThemeToggle", "Bascule clair / sombre"],
              ] as Array<['headerShowBuy' | 'headerShowMyTicket' | 'headerShowThemeToggle', string]>
            ).map(([cle, libelle]) => (
              <label key={cle} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  // Absent = affiché : un réglage jamais touché ne doit rien
                  // retirer à une page qui fonctionnait.
                  checked={theme[cle] !== false}
                  onChange={() => onChange({ [cle]: theme[cle] === false } as Partial<EventTheme>)}
                  className="size-4 rounded border-border"
                />
                {libelle}
              </label>
            ))}
          </div>
        </div>
        {/*
          Deux palettes côte à côte (2026-08-20). La sombre est DÉRIVÉE de la
          claire avec un contraste garanti : l’organisateur voit ce que sa page
          donnera dans les deux modes sans rien régler.

          Le bouton de surcharge n’ouvre les champs que pour qui veut y toucher.
          Imposer trois sélecteurs de plus à tout le monde ferait payer à la
          majorité la liberté d’une minorité.
        */}
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Sun className="size-3.5" /> Thème clair
        </div>
        <ColorField
          label="Couleur d'accent (boutons, badges)"
          value={theme.accentColor}
          onChange={(accentColor) => onChange({ accentColor })}
        />
        <ColorField
          label="Seconde couleur d'accent (optionnel)"
          value={theme.accentColorSecondary}
          onChange={(accentColorSecondary) => onChange({ accentColorSecondary })}
        />
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Combinée à la première pour les dégradés des boutons. Laissez vide pour une
          couleur unie.
        </p>
        <ColorField
          label="Fond de page"
          value={theme.backgroundColor}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Moon className="size-3.5" /> Thème sombre
          </div>
          <button
            type="button"
            onClick={() => setSombrePersonnalise((v) => !v)}
            aria-pressed={sombrePersonnalise}
            title={sombrePersonnalise ? "Revenir aux couleurs calculées" : "Choisir moi-même"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              sombrePersonnalise
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <SlidersHorizontal className="size-3" />
            Personnaliser
          </button>
        </div>

        {sombrePersonnalise ? (
          <>
            <ColorField
              label="Accent (thème sombre)"
              value={theme.accentColorDark ?? accentSombreCalcule ?? undefined}
              onChange={(accentColorDark) => onChange({ accentColorDark })}
            />
            <ColorField
              label="Second accent (thème sombre)"
              value={theme.accentColorSecondaryDark ?? accent2SombreCalcule ?? undefined}
              onChange={(accentColorSecondaryDark) => onChange({ accentColorSecondaryDark })}
            />
            <ColorField
              label="Fond de page (thème sombre)"
              value={theme.backgroundColorDark ?? fondSombreCalcule ?? undefined}
              onChange={(backgroundColorDark) => onChange({ backgroundColorDark })}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            <p className="text-[11px] text-muted-foreground">
              Calculées depuis le thème clair, avec un contraste garanti sur fond sombre.
            </p>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ["Accent", accentSombreCalcule],
                  ["Second accent", accent2SombreCalcule],
                  ["Fond", fondSombreCalcule],
                ] as Array<[string, string | null]>
              )
                .filter(([, valeur]) => Boolean(valeur))
                .map(([nom, valeur]) => (
                  <span key={nom} className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className="size-4 rounded-full border border-border"
                      style={{ backgroundColor: valeur as string }}
                    />
                    {nom} <code className="text-muted-foreground">{valeur}</code>
                  </span>
                ))}
              {!accentSombreCalcule && !fondSombreCalcule && (
                <span className="text-[11px] text-muted-foreground">
                  Choisissez d’abord des couleurs claires.
                </span>
              )}
            </div>
          </div>
        )}
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
            accentColorSecondary: undefined,
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
