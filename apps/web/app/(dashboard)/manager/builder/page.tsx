'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Image as ImageIcon,
  Type,
  Ticket,
  Timer,
  Images,
  HelpCircle,
  Monitor,
  Smartphone,
  Trash2,
  ArrowUp,
  ArrowDown,
  Video,
  CalendarDays,
  Users,
  Building2,
} from 'lucide-react';
import type { Block, BlockType } from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPut, ApiError } from '@/lib/api';

/**
 * Event Builder no-code (CDC §11 — blocs). Branché sur les vrais endpoints
 * backend `GET /api/builder/mine` / `PUT /api/builder/:eventId/blocks`
 * (ownership Manager + validation Zod + concurrence optimiste, RULES.md §5-6).
 *
 * Édition locale des blocs (ajout/suppression/réordonnancement/propriétés) en
 * mémoire, sauvegarde explicite via un seul bouton — pas d'auto-save, pour
 * garder le contrôle de concurrence simple à raisonner côté utilisateur.
 */

interface BuilderData {
  eventId: string;
  blocks: Block[];
  theme: Record<string, unknown>;
  isPublished: boolean;
  updatedAt: string | null;
}

interface EventTicket {
  id: string;
  name: string;
  price: string;
  currency: string;
}

const BLOCK_LIBRARY: { type: BlockType; icon: typeof ImageIcon; label: string }[] = [
  { type: 'hero', icon: ImageIcon, label: 'Hero / Couverture' },
  { type: 'text', icon: Type, label: 'Texte' },
  { type: 'tickets', icon: Ticket, label: 'Billets' },
  { type: 'countdown', icon: Timer, label: 'Compte à rebours' },
  { type: 'faq', icon: HelpCircle, label: 'FAQ' },
  { type: 'gallery', icon: Images, label: 'Galerie' },
  { type: 'video', icon: Video, label: 'Vidéo' },
  { type: 'schedule', icon: CalendarDays, label: 'Programme' },
  { type: 'testimonials', icon: Users, label: 'Témoignages' },
  { type: 'sponsors', icon: Building2, label: 'Sponsors' },
];

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  text: 'Texte',
  tickets: 'Billets',
  countdown: 'Compte à rebours',
  faq: 'FAQ',
  gallery: 'Galerie',
  video: 'Vidéo',
  schedule: 'Programme',
  testimonials: 'Témoignages',
  sponsors: 'Sponsors',
  image: 'Image',
};

function createBlock(type: BlockType, order: number): Block {
  return { id: crypto.randomUUID(), type, order, props: {} };
}

export default function EventBuilderPage() {
  const queryClient = useQueryClient();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['builder-mine'],
    queryFn: () => api<BuilderData>('/api/builder/mine'),
  });

  const { data: eventData } = useQuery({
    queryKey: ['manager-event'],
    queryFn: () => api<{ tickets: EventTicket[] }>('/api/events/mine'),
  });

  // Synchronise l'état local éditable avec la dernière version chargée/sauvegardée.
  useEffect(() => {
    if (!data) return;
    setBlocks(data.blocks);
    setLastKnownUpdatedAt(data.updatedAt);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiPut<BuilderData>(`/api/builder/${data!.eventId}/blocks`, {
      blocks,
      lastKnownUpdatedAt,
    }),
    onSuccess: (saved) => {
      toast.success('Page sauvegardée');
      setLastKnownUpdatedAt(saved.updatedAt);
      setSavedAt(new Date());
      queryClient.setQueryData(['builder-mine'], saved);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'BUILDER_CONFLICT') {
        toast.error('Cette page a été modifiée ailleurs — rechargement des dernières données.');
        queryClient.invalidateQueries({ queryKey: ['builder-mine'] });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Impossible de sauvegarder la page');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger le builder de votre événement.
      </div>
    );
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  function addBlock(type: BlockType) {
    const block = createBlock(type, blocks.length);
    setBlocks((prev) => [...prev, block]);
    setSelectedId(block.id);
  }

  function updateSelected(patch: Partial<Block>) {
    if (!selected) return;
    setBlocks((prev) => prev.map((b) => (b.id === selected.id ? { ...b, ...patch } : b)));
  }

  function updateSelectedProps(props: Record<string, unknown>) {
    if (!selected) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === selected.id ? { ...b, props: { ...b.props, ...props } } : b)),
    );
  }

  function updateSelectedStyles(styles: Block['styles']) {
    if (!selected) return;
    setBlocks((prev) =>
      prev.map((b) => (b.id === selected.id ? { ...b, styles: { ...b.styles, ...styles } } : b)),
    );
  }

  function removeSelected() {
    if (!selected) return;
    setBlocks((prev) =>
      prev
        .filter((b) => b.id !== selected.id)
        .map((b, i) => ({ ...b, order: i })),
    );
    setSelectedId(null);
  }

  function moveSelected(direction: -1 | 1) {
    if (!selected) return;
    const ordered = [...blocks].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((b) => b.id === selected.id);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    setBlocks(ordered.map((b, i) => ({ ...b, order: i })));
  }

  return (
    <div className="flex h-svh flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">Builder</span>
          <span className="text-xs text-muted-foreground">
            {savedAt
              ? `Sauvegardé à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : data.updatedAt
                ? `Dernière sauvegarde ${new Date(data.updatedAt).toLocaleString('fr-FR')}`
                : 'Pas encore sauvegardé'}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Block library */}
        <aside className="w-55 shrink-0 overflow-y-auto border-r border-border p-4">
          <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Blocs
          </div>
          <div className="flex flex-col gap-1.5">
            {BLOCK_LIBRARY.map((b) => (
              <button
                key={b.type}
                type="button"
                onClick={() => addBlock(b.type)}
                className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left text-sm font-medium hover:bg-accent"
              >
                <b.icon className="size-4" />
                {b.label}
              </button>
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
            {sortedBlocks.length === 0 && (
              <div className="p-10 text-center text-xs text-muted-foreground">
                Aucun bloc pour le moment — ajoutez-en un depuis la bibliothèque à gauche.
              </div>
            )}

            {sortedBlocks.map((block) => {
              const isSelected = block.id === selectedId;
              const outline = isSelected ? 'outline-[oklch(58%_0.16_40)]' : 'outline-transparent';

              if (block.type === 'hero') {
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    style={{
                      backgroundColor: (block.styles?.backgroundColor as string) || undefined,
                      textAlign: block.styles?.textAlign,
                    }}
                    className={`relative block h-40 w-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_12px,#E7E4DE_12px_24px)] text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    <span className="absolute bottom-3.5 left-4 font-serif text-xl text-white">
                      {(block.props.title as string) || 'Titre du hero'}
                    </span>
                  </button>
                );
              }

              if (block.type === 'text') {
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    style={{ textAlign: block.styles?.textAlign }}
                    className={`block w-full border-b border-dashed border-border p-4 text-left text-xs text-muted-foreground outline-2 -outline-offset-2 ${outline}`}
                  >
                    {(block.props.content as string) || 'Bloc Texte — description de l’événement…'}
                  </button>
                );
              }

              if (block.type === 'tickets') {
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    className={`flex w-full flex-col gap-2 p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    {(eventData?.tickets.length ?? 0) === 0 ? (
                      <span className="text-xs text-muted-foreground">Aucun billet configuré</span>
                    ) : (
                      eventData!.tickets.map((t) => (
                        <div
                          key={t.id}
                          className="flex justify-between rounded-lg border border-border px-3 py-2.5 text-xs"
                        >
                          <span>{t.name}</span>
                          <span>
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: t.currency }).format(
                              Number(t.price),
                            )}
                          </span>
                        </div>
                      ))
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedId(block.id)}
                  className={`block w-full border-b border-dashed border-border p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                >
                  <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    {BLOCK_LABELS[block.type]}
                  </div>
                  {(block.props.title as string) && (
                    <div className="mt-1 text-sm font-semibold">{block.props.title as string}</div>
                  )}
                  {(block.props.content as string) && (
                    <div className="mt-1 text-xs text-muted-foreground">{block.props.content as string}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Properties panel */}
        <aside className="w-65 shrink-0 overflow-y-auto border-l border-border p-4.5">
          {!selected ? (
            <div className="text-xs text-muted-foreground">
              Sélectionnez un bloc dans l&apos;aperçu, ou ajoutez-en un depuis la bibliothèque.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  Propriétés — {BLOCK_LABELS[selected.type]}
                </div>
                <button type="button" onClick={removeSelected} aria-label="Supprimer le bloc">
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>

              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => moveSelected(-1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => moveSelected(1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>

              {selected.type === 'hero' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Titre</label>
                    <Input
                      value={(selected.props.title as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ title: e.target.value })}
                    />
                  </div>
                  <TextAlignPicker
                    value={selected.styles?.textAlign}
                    onChange={(textAlign) => updateSelectedStyles({ textAlign })}
                  />
                  <ColorField
                    label="Couleur de fond"
                    value={selected.styles?.backgroundColor}
                    onChange={(backgroundColor) => updateSelectedStyles({ backgroundColor })}
                  />
                </>
              )}

              {selected.type === 'text' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Contenu</label>
                    <textarea
                      value={(selected.props.content as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ content: e.target.value })}
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <TextAlignPicker
                    value={selected.styles?.textAlign}
                    onChange={(textAlign) => updateSelectedStyles({ textAlign })}
                  />
                </>
              )}

              {selected.type === 'tickets' && (
                <p className="text-xs text-muted-foreground">
                  Ce bloc affiche automatiquement les billets réels de votre événement.
                </p>
              )}

              {selected.type !== 'hero' && selected.type !== 'text' && selected.type !== 'tickets' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Titre</label>
                    <Input
                      value={(selected.props.title as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Contenu</label>
                    <textarea
                      value={(selected.props.content as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ content: e.target.value })}
                      rows={3}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TextAlignPicker({
  value,
  onChange,
}: {
  value?: 'left' | 'center' | 'right';
  onChange: (value: 'left' | 'center' | 'right') => void;
}) {
  const options: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
    { value: 'left', label: 'Gauche' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Droite' },
  ];
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">Alignement texte</label>
      <div className="flex overflow-hidden rounded-md border border-border">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 text-center text-xs font-medium ${
              value === opt.value ? 'bg-primary text-primary-foreground' : ''
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => setText(value ?? ''), [value]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_PATTERN.test(text) ? text : '#000000'}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
        />
        <Input
          value={text}
          placeholder="#000000"
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            onChange(HEX_PATTERN.test(next) ? next : undefined);
          }}
        />
      </div>
    </div>
  );
}
