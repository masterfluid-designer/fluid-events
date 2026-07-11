'use client';

import { useState } from 'react';
import {
  Image as ImageIcon,
  Type,
  Ticket,
  Timer,
  MapPin,
  HelpCircle,
  Images,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Event Builder no-code (CDC §11 — blocs drag & drop).
 * Le module backend `builder` n'est qu'un stub côté API (pas de persistance
 * encore branchée) : cette page est une maquette interactive côté client
 * (sélection de bloc → panneau de propriétés), sans appel réseau.
 */

type BlockType = 'hero' | 'text' | 'tickets';

const blockLibrary = [
  { icon: ImageIcon, label: 'Hero / Couverture' },
  { icon: Type, label: 'Texte' },
  { icon: Ticket, label: 'Billets' },
  { icon: Timer, label: 'Compte à rebours' },
  { icon: MapPin, label: 'Localisation' },
  { icon: HelpCircle, label: 'FAQ' },
  { icon: Images, label: 'Galerie' },
];

const templates = ['Concert', 'Conférence'];

export default function EventBuilderPage() {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('hero');

  return (
    <div className="flex h-svh flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">Builder</span>
          <span className="text-xs text-muted-foreground">Concert FESTA 2026</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 text-xs text-muted-foreground">Sauvegardé à 14:32</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              aria-label="Aperçu bureau"
              className={`p-1.5 px-2.5 ${device === 'desktop' ? 'bg-card' : 'bg-transparent'}`}
            >
              <Monitor className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              aria-label="Aperçu mobile"
              className={`border-l border-border p-1.5 px-2.5 ${device === 'mobile' ? 'bg-card' : 'bg-transparent'}`}
            >
              <Smartphone className="size-3.5" />
            </button>
          </div>
          <Button size="sm">Publier</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Block library */}
        <aside className="w-55 shrink-0 overflow-y-auto border-r border-border p-4">
          <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Blocs
          </div>
          <div className="flex flex-col gap-1.5">
            {blockLibrary.map((b) => (
              <div
                key={b.label}
                className="flex cursor-grab items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-sm font-medium hover:bg-accent"
              >
                <b.icon className="size-4" />
                {b.label}
              </div>
            ))}
          </div>
          <div className="mb-2.5 mt-5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Templates
          </div>
          <div className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <div
                key={t}
                className="rounded-lg border border-border px-2.5 py-2 text-sm hover:bg-accent"
              >
                {t}
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex flex-1 justify-center overflow-y-auto bg-background p-6">
          <div
            className={`h-fit overflow-hidden rounded-xl bg-card shadow-solid-2 ${
              device === 'mobile' ? 'w-80' : 'w-130'
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedBlock('hero')}
              className={`relative block h-40 w-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_12px,#E7E4DE_12px_24px)] text-left outline-2 -outline-offset-2 ${
                selectedBlock === 'hero' ? 'outline-[oklch(58%_0.16_40)]' : 'outline-transparent'
              }`}
            >
              {selectedBlock === 'hero' && (
                <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-[oklch(58%_0.16_40)]">
                  Hero — sélectionné
                </span>
              )}
              <span className="absolute bottom-3.5 left-4 font-serif text-xl text-white">
                Concert FESTA 2026
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedBlock('text')}
              className={`block w-full border-b border-dashed border-border p-4 text-left text-xs text-muted-foreground ${
                selectedBlock === 'text' ? 'bg-accent' : ''
              }`}
            >
              Bloc Texte — description de l&apos;événement…
            </button>
            <button
              type="button"
              onClick={() => setSelectedBlock('tickets')}
              className={`flex w-full flex-col gap-2 p-4 text-left ${
                selectedBlock === 'tickets' ? 'bg-accent' : ''
              }`}
            >
              <div className="flex justify-between rounded-lg border border-border px-3 py-2.5 text-xs">
                <span>VIP Or</span>
                <span>15 000 XOF</span>
              </div>
              <div className="flex justify-between rounded-lg border border-border px-3 py-2.5 text-xs">
                <span>Standard</span>
                <span>6 000 XOF</span>
              </div>
            </button>
          </div>
        </div>

        {/* Properties panel */}
        <aside className="w-65 shrink-0 overflow-y-auto border-l border-border p-4.5">
          <div className="mb-3.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Propriétés — {selectedBlock === 'hero' ? 'Hero' : selectedBlock === 'text' ? 'Texte' : 'Billets'}
          </div>

          {selectedBlock === 'hero' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Image de couverture</label>
                <div className="flex h-17.5 items-center justify-center rounded-lg border border-dashed border-input text-xs text-muted-foreground">
                  Déposer un fichier
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Titre</label>
                <div className="rounded-md border border-border px-2.5 py-2 text-sm">
                  Concert FESTA 2026
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Alignement texte</label>
                <div className="flex overflow-hidden rounded-md border border-border">
                  <span className="flex-1 bg-primary py-1.5 text-center text-xs font-medium text-primary-foreground">
                    Gauche
                  </span>
                  <span className="flex-1 border-l border-border py-1.5 text-center text-xs">
                    Centre
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Dégradé sombre</span>
                <span className="relative inline-block h-4.5 w-8.5 rounded-full bg-primary">
                  <span className="absolute right-0.5 top-0.5 size-3.5 rounded-full bg-white" />
                </span>
              </div>
            </div>
          )}

          {selectedBlock === 'text' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Contenu</label>
                <div className="rounded-md border border-border px-2.5 py-2 text-sm text-muted-foreground">
                  Trois plateaux, dix artistes, une seule nuit…
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Taille du texte</label>
                <div className="rounded-md border border-border px-2.5 py-2 text-sm">Standard</div>
              </div>
            </div>
          )}

          {selectedBlock === 'tickets' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Billets affichés</label>
                <div className="rounded-md border border-border px-2.5 py-2 text-sm">Tous</div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold">Style des cartes</label>
                <div className="rounded-md border border-border px-2.5 py-2 text-sm">Liste</div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
