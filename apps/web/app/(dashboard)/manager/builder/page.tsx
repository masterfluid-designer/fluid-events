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
  Code2,
  Pencil,
  Eye,
  RefreshCw,
  Mic2,
  Settings2,
  LayoutGrid,
} from 'lucide-react';
import type { Block, BlockType } from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ColorField } from '@/components/ui/color-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { api, apiPatch, apiPut, ApiError } from '@/lib/api';
import { ConfigPanel, type EventConfig } from './config-panel';

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

interface ManagerEventData extends EventConfig {
  slug: string;
  startDate: string;
  tickets: EventTicket[];
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
  { type: 'speakers', icon: Mic2, label: 'Speakers' },
  { type: 'sponsors', icon: Building2, label: 'Sponsors' },
  { type: 'html', icon: Code2, label: 'HTML personnalisé' },
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
  speakers: 'Speakers',
  sponsors: 'Sponsors',
  image: 'Image',
  html: 'HTML personnalisé',
};

/**
 * Types de blocs "placement uniquement" (décision produit 2026-07-13) : leur
 * contenu vit dans l'onglet Config (un seul jeu de données par événement),
 * pas dans `block.props` — les poser sur la page affiche automatiquement ce
 * contenu. Un seul exemplaire a du sens (le contenu est identique partout).
 */
const SINGLETON_BLOCK_TYPES = new Set<BlockType>(['faq', 'schedule', 'speakers', 'gallery', 'sponsors']);

function createBlock(type: BlockType, order: number): Block {
  return { id: crypto.randomUUID(), type, order, props: {} };
}

const EMPTY_CONFIG: EventConfig = {
  title: '',
  description: '',
  location: '',
  logoUrl: '',
  coverImageUrl: '',
  faqs: [],
  schedule: [],
  speakers: [],
  galleryImages: [],
  sponsorImages: [],
};

export default function EventBuilderPage() {
  const queryClient = useQueryClient();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [sidebarTab, setSidebarTab] = useState<'blocs' | 'config'>('blocs');
  const [previewNonce, setPreviewNonce] = useState(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [config, setConfig] = useState<EventConfig>(EMPTY_CONFIG);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['builder-mine'],
    queryFn: () => api<BuilderData>('/api/builder/mine'),
  });

  const { data: eventData } = useQuery({
    queryKey: ['manager-event'],
    queryFn: () => api<ManagerEventData>('/api/events/mine'),
  });

  // Synchronise l'état local éditable avec la dernière version chargée/sauvegardée.
  useEffect(() => {
    if (!data) return;
    setBlocks(data.blocks);
    setLastKnownUpdatedAt(data.updatedAt);
  }, [data]);

  // Synchronise le contenu centralisé (onglet Config) avec l'événement chargé.
  // Les champs texte/URL sont nullable côté Prisma — jamais null en state ici
  // (contrôlé par des <input>/<textarea>, React avertit sur value={null}).
  useEffect(() => {
    if (!eventData) return;
    setConfig({
      title: eventData.title ?? '',
      description: eventData.description ?? '',
      location: eventData.location ?? '',
      logoUrl: eventData.logoUrl ?? '',
      coverImageUrl: eventData.coverImageUrl ?? '',
      faqs: eventData.faqs ?? [],
      schedule: eventData.schedule ?? [],
      speakers: eventData.speakers ?? [],
      galleryImages: eventData.galleryImages ?? [],
      sponsorImages: eventData.sponsorImages ?? [],
    });
  }, [eventData]);

  function updateConfig(patch: Partial<EventConfig>) {
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  // Sauvegarde unifiée : blocs (structure/ordre de la page) + contenu
  // centralisé (Config) partent ensemble en un seul clic sur "Enregistrer"
  // (pas d'auto-save, un seul bouton — cohérent avec le reste du Builder).
  const save = useMutation({
    mutationFn: async () => {
      const [savedBuilder] = await Promise.all([
        apiPut<BuilderData>(`/api/builder/${data!.eventId}/blocks`, {
          blocks,
          lastKnownUpdatedAt,
        }),
        apiPatch('/api/events/mine', {
          title: config.title,
          description: config.description,
          location: config.location,
          logoUrl: config.logoUrl || undefined,
          coverImageUrl: config.coverImageUrl || undefined,
          faqs: config.faqs,
          schedule: config.schedule,
          speakers: config.speakers,
          galleryImages: config.galleryImages,
          sponsorImages: config.sponsorImages,
        }),
      ]);
      return savedBuilder;
    },
    onSuccess: (saved) => {
      toast.success('Page sauvegardée');
      setLastKnownUpdatedAt(saved.updatedAt);
      setSavedAt(new Date());
      setPreviewNonce((n) => n + 1);
      queryClient.setQueryData(['builder-mine'], saved);
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
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

  /** Insère un nouveau bloc à l'index donné (ordre parmi les blocs triés) et le sélectionne. */
  function insertBlockAt(type: BlockType, index: number) {
    const block = createBlock(type, index);
    setBlocks((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      ordered.splice(index, 0, block);
      return ordered.map((b, i) => ({ ...b, order: i }));
    });
    setSelectedId(block.id);
  }

  function addBlock(type: BlockType) {
    insertBlockAt(type, blocks.length);
  }

  /** Déplace un bloc existant (glissé) vers l'index cible parmi les blocs triés. */
  function moveBlockToIndex(id: string, targetIndex: number) {
    setBlocks((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      const fromIndex = ordered.findIndex((b) => b.id === id);
      if (fromIndex === -1) return prev;
      const [moved] = ordered.splice(fromIndex, 1);
      const insertAt = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      ordered.splice(insertAt, 0, moved);
      return ordered.map((b, i) => ({ ...b, order: i }));
    });
  }

  /** Calcule l'index de dépôt (avant/après le bloc survolé) depuis la position du curseur. */
  function handleDragOverBlock(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingBlockId ? 'move' : 'copy';
    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = e.clientY - rect.top > rect.height / 2;
    setDragOverIndex(isAfter ? index + 1 : index);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const index = dragOverIndex ?? sortedBlocks.length;
    const libraryType = e.dataTransfer.getData('application/x-block-type') as BlockType | '';
    const reorderId = e.dataTransfer.getData('application/x-block-id');
    if (libraryType) {
      insertBlockAt(libraryType, index);
    } else if (reorderId) {
      moveBlockToIndex(reorderId, index);
    }
    setDragOverIndex(null);
    setDraggingBlockId(null);
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
    <div className="flex min-h-svh flex-col md:h-svh">
      {/* Topbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">Builder</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {savedAt
              ? `Sauvegardé à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
              : data.updatedAt
                ? `Dernière sauvegarde ${new Date(data.updatedAt).toLocaleString('fr-FR')}`
                : 'Pas encore sauvegardé'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setMode('edit')}
              aria-label="Mode édition"
              className={`flex items-center gap-1.5 p-1.5 px-2.5 text-xs font-medium ${mode === 'edit' ? 'bg-card' : 'bg-transparent'}`}
            >
              <Pencil className="size-3.5" /> Éditer
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('preview');
                setPreviewNonce((n) => n + 1);
              }}
              aria-label="Mode aperçu réel"
              className={`flex items-center gap-1.5 border-l border-border p-1.5 px-2.5 text-xs font-medium ${mode === 'preview' ? 'bg-card' : 'bg-transparent'}`}
            >
              <Eye className="size-3.5" /> Aperçu réel
            </button>
          </div>
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
          {mode === 'preview' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewNonce((n) => n + 1)}
              aria-label="Rafraîchir l'aperçu"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Bibliothèque de blocs / Config */}
        {mode === 'edit' && (
          <aside className="max-h-80 w-full shrink-0 overflow-y-auto border-b border-border md:max-h-none md:w-72 md:border-b-0 md:border-r">
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setSidebarTab('blocs')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
                  sidebarTab === 'blocs' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
                }`}
              >
                <LayoutGrid className="size-3.5" /> Blocs
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('config')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
                  sidebarTab === 'config' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Settings2 className="size-3.5" /> Config
              </button>
            </div>

            {sidebarTab === 'blocs' ? (
              <div className="p-4">
                <p className="mb-2.5 text-[11px] text-muted-foreground">
                  Cliquez ou glissez un bloc dans l&apos;aperçu.
                </p>
                <div className="flex flex-col gap-1.5">
                  {BLOCK_LIBRARY.map((b) => {
                    const alreadyPlaced =
                      SINGLETON_BLOCK_TYPES.has(b.type) && blocks.some((bl) => bl.type === b.type);
                    return (
                      <button
                        key={b.type}
                        type="button"
                        disabled={alreadyPlaced}
                        draggable={!alreadyPlaced}
                        title={alreadyPlaced ? 'Déjà ajouté — contenu unique par événement' : undefined}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-block-type', b.type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => !alreadyPlaced && addBlock(b.type)}
                        className={`flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left text-sm font-medium ${
                          alreadyPlaced
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-grab hover:bg-accent active:cursor-grabbing'
                        }`}
                      >
                        <b.icon className="size-4" />
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ConfigPanel config={config} onChange={updateConfig} />
            )}
          </aside>
        )}

        {/* Canvas */}
        <div className="flex flex-1 justify-center overflow-x-auto overflow-y-auto bg-background p-4 sm:p-6">
          {mode === 'preview' ? (
            <div
              className={`h-full overflow-hidden rounded-xl border border-border bg-card shadow-solid-2 ${
                device === 'mobile' ? 'w-95' : 'w-full max-w-4xl'
              }`}
            >
              {eventData?.slug ? (
                <iframe
                  key={previewNonce}
                  src={`/e/${eventData.slug}`}
                  title="Aperçu de la page publique"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-5" />
                </div>
              )}
            </div>
          ) : (
          <div
            className={`h-fit overflow-hidden rounded-xl bg-card shadow-solid-2 ${
              device === 'mobile' ? 'w-80' : 'w-130'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              if (sortedBlocks.length === 0) setDragOverIndex(0);
            }}
            onDrop={handleDrop}
          >
            {sortedBlocks.length === 0 && (
              <div className="p-10 text-center text-xs text-muted-foreground">
                Aucun bloc pour le moment — ajoutez-en un depuis la bibliothèque à gauche
                (clic ou glisser-déposer).
              </div>
            )}

            {sortedBlocks.map((block, index) => {
              const isSelected = block.id === selectedId;
              const outline = isSelected ? 'outline-[oklch(58%_0.16_40)]' : 'outline-transparent';

              let content: React.ReactNode;

              if (block.type === 'hero') {
                const imageUrl = block.props.imageUrl as string | undefined;
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    style={{
                      backgroundColor: block.styles?.backgroundColor || undefined,
                      backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      textAlign: block.styles?.textAlign,
                    }}
                    className={`relative block h-40 w-full text-left outline-2 -outline-offset-2 ${outline} ${
                      imageUrl ? '' : 'bg-[repeating-linear-gradient(135deg,#EFEDE7_0_12px,#E7E4DE_12px_24px)]'
                    }`}
                  >
                    <span className="absolute bottom-3.5 left-4 font-serif text-xl text-white">
                      {(block.props.title as string) || 'Titre du hero'}
                    </span>
                  </button>
                );
              } else if (block.type === 'text') {
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    style={{ textAlign: block.styles?.textAlign }}
                    className={`block w-full border-b border-dashed border-border p-4 text-left text-xs text-muted-foreground outline-2 -outline-offset-2 ${outline}`}
                  >
                    {(block.props.content as string) || 'Bloc Texte — description de l’événement…'}
                  </button>
                );
              } else if (block.type === 'html') {
                // Jamais de dangerouslySetInnerHTML ici : ce contenu n'est pas
                // encore passé par le nettoyage serveur (sanitizeBlockHtml,
                // appliqué seulement à la sauvegarde) — l'interpréter en direct
                // exécuterait n'importe quel gestionnaire d'événement inline
                // tapé par le Manager dans son propre navigateur (self-XSS
                // pendant l'édition). Aperçu texte brut ici ; le rendu réel
                // (sanitisé) est visible via le mode "Aperçu réel" après
                // sauvegarde.
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    className={`block w-full border-b border-dashed border-border p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      HTML personnalisé
                    </div>
                    {(block.props.htmlContent as string) ? (
                      <div className="truncate whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                        {(block.props.htmlContent as string).slice(0, 140)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Bloc HTML vide — éditez-le à droite</span>
                    )}
                    <span className="mt-1 block text-[11px] italic text-muted-foreground">
                      Aperçu non interprété — utilisez « Aperçu réel » après sauvegarde.
                    </span>
                  </button>
                );
              } else if (block.type === 'tickets') {
                content = (
                  <button
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
              } else if (SINGLETON_BLOCK_TYPES.has(block.type)) {
                const count = {
                  faq: config.faqs.length,
                  schedule: config.schedule.length,
                  speakers: config.speakers.length,
                  gallery: config.galleryImages.length,
                  sponsors: config.sponsorImages.length,
                }[block.type as 'faq' | 'schedule' | 'speakers' | 'gallery' | 'sponsors'];
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    className={`block w-full border-b border-dashed border-border p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      {BLOCK_LABELS[block.type]}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {count > 0
                        ? `Affiche ${count} entrée${count > 1 ? 's' : ''} configurée${count > 1 ? 's' : ''}`
                        : 'Rien à afficher pour le moment — configurez du contenu dans l’onglet Config'}
                    </div>
                  </button>
                );
              } else if (block.type === 'countdown') {
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    className={`block w-full border-b border-dashed border-border p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      Compte à rebours
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {eventData?.startDate
                        ? `Décompte automatique jusqu'au ${new Date(eventData.startDate).toLocaleString('fr-FR')}`
                        : 'Décompte automatique jusqu’à la date de début de l’événement'}
                    </div>
                  </button>
                );
              } else {
                content = (
                  <button
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
              }

              return (
                <div key={block.id}>
                  {dragOverIndex === index && <div className="mx-2 h-1 rounded-full bg-accent-terracotta" />}
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-block-id', block.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingBlockId(block.id);
                    }}
                    onDragEnd={() => {
                      setDraggingBlockId(null);
                      setDragOverIndex(null);
                    }}
                    onDragOver={(e) => handleDragOverBlock(e, index)}
                    className={`cursor-grab active:cursor-grabbing ${block.styles?.customClassName ?? ''}`}
                  >
                    {content}
                  </div>
                </div>
              );
            })}

            {dragOverIndex === sortedBlocks.length && sortedBlocks.length > 0 && (
              <div className="mx-2 h-1 rounded-full bg-accent-terracotta" />
            )}
            {sortedBlocks.length > 0 && (
              <div
                className="h-8 w-full"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(sortedBlocks.length);
                }}
              />
            )}
          </div>
          )}
        </div>

        {/* Properties panel — masqué en mode aperçu réel */}
        {mode === 'edit' && (
        <aside className="w-full shrink-0 overflow-y-auto border-t border-border p-4.5 md:w-65 md:border-l md:border-t-0">
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
                  <ImageUploadField
                    label="Image de couverture"
                    value={selected.props.imageUrl as string | undefined}
                    onChange={(imageUrl) => updateSelectedProps({ imageUrl })}
                  />
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

              {selected.type === 'html' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold">Code HTML</label>
                  <textarea
                    value={(selected.props.htmlContent as string) ?? ''}
                    onChange={(e) => updateSelectedProps({ htmlContent: e.target.value })}
                    rows={8}
                    spellCheck={false}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Nettoyé automatiquement à l&apos;enregistrement : scripts, gestionnaires
                    d&apos;événements et balises dangereuses (iframe, object, style...) sont
                    retirés avant publication.
                  </p>
                </div>
              )}

              {SINGLETON_BLOCK_TYPES.has(selected.type) && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Ce bloc affiche automatiquement le contenu configuré dans l&apos;onglet Config
                    (un seul jeu de contenu par événement).
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => setSidebarTab('config')}
                  >
                    <Settings2 className="size-3.5" /> Éditer dans Config
                  </Button>
                </div>
              )}

              {selected.type === 'countdown' && (
                <p className="text-xs text-muted-foreground">
                  Ce bloc décompte automatiquement jusqu&apos;à la date de début de votre événement
                  — aucune saisie manuelle nécessaire.
                </p>
              )}

              {selected.type !== 'hero' &&
                selected.type !== 'text' &&
                selected.type !== 'tickets' &&
                selected.type !== 'html' &&
                selected.type !== 'countdown' &&
                !SINGLETON_BLOCK_TYPES.has(selected.type) && (
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

              <div className="border-t border-border pt-3.5">
                <label className="mb-1.5 block text-xs font-semibold">Classes CSS personnalisées</label>
                <Input
                  value={selected.styles?.customClassName ?? ''}
                  onChange={(e) => updateSelectedStyles({ customClassName: e.target.value })}
                  placeholder="ex : mt-8 rounded-2xl shadow-lg"
                  className="font-mono text-xs"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Classes Tailwind ajoutées au conteneur du bloc. Une classe totalement inédite
                  n&apos;aura d&apos;effet que si elle existe déjà dans le design system —
                  Tailwind ne génère pas de CSS à la volée pour du texte saisi ici.
                </p>
              </div>
            </div>
          )}
          </aside>
        )}
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

