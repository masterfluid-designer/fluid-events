'use client';

import { MEDIA_ASPECT_LABEL, type MediaAspect } from '@/lib/media';
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
  History,
  MapPin,
  Plus,
  Palette,
  Check,
} from 'lucide-react';
import type { Block, BlockType, EventTheme, TestimonialEntry, TimelineEntry } from '@saas-events/types';
import {
  SINGLETON_BLOCK_TYPES as SHARED_SINGLETON_BLOCK_TYPES,
  TicketPolicy,
} from '@saas-events/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ColorField } from '@/components/ui/color-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { api, apiPatch, apiPut, ApiError } from '@/lib/api';
import { PublicLink } from '@/components/dashboard/public-link';
import { ConfigPanel, type EventConfig } from './config-panel';
import { ThemePanel } from './theme-panel';

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

interface ManagerEventData extends Omit<EventConfig, 'days'> {
  slug: string;
  startDate: string;
  tickets: EventTicket[];
  /** Lignes `EventDay` telles que rendues par l’API (date ISO complète). */
  days: Array<{ id: string; label: string; date: string; order: number }>;
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
  { type: 'timeline', icon: History, label: 'Frise / Héritage' },
  { type: 'location', icon: MapPin, label: 'Lieu & accès' },
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
  timeline: 'Frise / Héritage',
  location: 'Lieu & accès',
};

/**
 * Types de blocs "placement uniquement" (décision produit 2026-07-13) : leur
 * contenu vit dans l'onglet Config (un seul jeu de données par événement),
 * pas dans `block.props` — les poser sur la page affiche automatiquement ce
 * contenu. Un seul exemplaire a du sens (le contenu est identique partout).
 */
// Liste partagée avec le serveur (packages/types) : `hero` et `tickets` y
// manquaient, ce qui a laissé empiler six ouvertures sur une page réelle.
const SINGLETON_BLOCK_TYPES = new Set<BlockType>(SHARED_SINGLETON_BLOCK_TYPES);

function createBlock(type: BlockType, order: number): Block {
  return { id: crypto.randomUUID(), type, order, props: {} };
}

const EMPTY_CONFIG: EventConfig = {
  title: '',
  description: '',
  location: '',
  venueName: '',
  addressLine: '',
  city: '',
  country: '',
  accessNotes: '',
  contactPhone: '',
  latitude: '',
  longitude: '',
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
  const [sidebarTab, setSidebarTab] = useState<'blocs' | 'config' | 'theme'>('blocs');
  const [theme, setTheme] = useState<EventTheme>({});
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

  // Même clé que le gate de vérification : la réponse est déjà en cache.
  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ isPremium: boolean }>('/api/auth/me'),
  });

  // Synchronise l'état local éditable avec la dernière version chargée/sauvegardée.
  useEffect(() => {
    if (!data) return;
    setBlocks(data.blocks);
    setTheme((data.theme ?? {}) as EventTheme);
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
      venueName: eventData.venueName ?? '',
      addressLine: eventData.addressLine ?? '',
      city: eventData.city ?? '',
      country: eventData.country ?? '',
      accessNotes: eventData.accessNotes ?? '',
      contactPhone: eventData.contactPhone ?? '',
      latitude: eventData.latitude == null ? '' : String(eventData.latitude),
      longitude: eventData.longitude == null ? '' : String(eventData.longitude),
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
          theme,
          lastKnownUpdatedAt,
        }),
        apiPatch('/api/events/mine', {
          title: config.title,
          description: config.description,
          location: config.location,
          // Chaîne vide → undefined : PATCH partiel, un champ laissé vide ne
          // doit pas écraser la valeur existante par une chaîne vide.
          venueName: config.venueName || undefined,
          addressLine: config.addressLine || undefined,
          city: config.city || undefined,
          country: config.country || undefined,
          accessNotes: config.accessNotes || undefined,
          contactPhone: config.contactPhone || undefined,
          latitude: config.latitude ? Number(config.latitude) : undefined,
          longitude: config.longitude ? Number(config.longitude) : undefined,
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

  /**
   * Clic sur un bloc de la palette (décision produit 2026-08-18).
   *
   * Pour un bloc unique par page, le clic BASCULE : posé, un second clic le
   * retire. Auparavant le bouton devenait inerte, ce qui n'apprenait rien et
   * obligeait à retrouver le bloc dans l'aperçu pour le supprimer.
   *
   * Pour les blocs à contenu propre (text, image, video, html, timeline,
   * testimonials), le clic ajoute toujours : en vouloir plusieurs est
   * légitime, et « basculer » n'y voudrait rien dire — lequel retirerait-on ?
   *
   * Sans danger : les blocs restent en état local jusqu'au clic sur
   * « Enregistrer », un retrait involontaire se défait en rechargeant.
   */
  function toggleBlockType(type: BlockType) {
    const placed = SINGLETON_BLOCK_TYPES.has(type)
      ? blocks.filter((b) => b.type === type)
      : [];
    if (placed.length === 0) {
      addBlock(type);
      return;
    }
    // TOUS les exemplaires partent, pas seulement le premier : une page
    // construite avant la règle d'unicité peut en compter six, et il faudrait
    // sinon six clics — sachant qu'aucun enregistrement ne passe tant qu'il en
    // reste plus d'un. Un clic pour nettoyer, un second pour reposer un bloc
    // neuf.
    const doomed = new Set(placed.map((b) => b.id));
    setBlocks((prev) =>
      prev.filter((b) => !doomed.has(b.id)).map((b, i) => ({ ...b, order: i })),
    );
    setSelectedId((current) => (current && doomed.has(current) ? null : current));
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
          {eventData?.slug && <PublicLink slug={eventData.slug} variant="compact" />}
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
              <button
                type="button"
                onClick={() => setSidebarTab('theme')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold ${
                  sidebarTab === 'theme' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'
                }`}
              >
                <Palette className="size-3.5" /> Thème
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
                        aria-pressed={alreadyPlaced}
                        // Un bloc déjà posé ne se glisse plus : le glisser
                        // n'aurait de sens que pour en ajouter un second.
                        draggable={!alreadyPlaced}
                        title={
                          alreadyPlaced
                            ? 'Sur la page — cliquez pour le retirer'
                            : 'Cliquez ou glissez pour ajouter'
                        }
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-block-type', b.type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => toggleBlockType(b.type)}
                        className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                          alreadyPlaced
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'cursor-grab border-border hover:bg-accent active:cursor-grabbing'
                        }`}
                      >
                        <b.icon className="size-4" />
                        <span className="min-w-0 flex-1 truncate">{b.label}</span>
                        {alreadyPlaced && (
                          <Check className="size-3.5 shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : sidebarTab === 'config' ? (
              <ConfigPanel
                config={config}
                onChange={updateConfig}
                // Journées déclarées côté Billetterie : elles situent chaque
                // entrée du programme, elles ne s'éditent pas ici.
                days={eventData?.days ?? []}
              />
            ) : (
              <div className="p-4">
                <ThemePanel
                  theme={theme}
                  onChange={(patch) => setTheme((prev) => ({ ...prev, ...patch }))}
                />
              </div>
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
                  // Le bloc Lieu n’affiche pas une liste mais jusqu’à trois
                  // encarts (adresse, accès, contact) : on compte ceux qui
                  // sont réellement remplis, pour que « rien à afficher »
                  // reste exact.
                  location: [
                    config.venueName || config.addressLine || config.city || config.location,
                    config.accessNotes,
                    config.contactPhone,
                  ].filter(Boolean).length,
                }[block.type as 'faq' | 'schedule' | 'speakers' | 'gallery' | 'sponsors' | 'location'];
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
              } else if (block.type === 'timeline') {
                const entries = (block.props.entries as TimelineEntry[] | undefined) ?? [];
                content = (
                  <button
                    type="button"
                    onClick={() => setSelectedId(block.id)}
                    className={`block w-full border-b border-dashed border-border p-4 text-left outline-2 -outline-offset-2 ${outline}`}
                  >
                    <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
                      {(block.props.title as string) || 'Frise / Héritage'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {entries.length > 0
                        ? `${entries.length} jalon${entries.length > 1 ? 's' : ''} — ${entries.map((e) => e.label).join(' → ')}`
                        : 'Aucun jalon — ajoutez-en un dans le panneau de droite'}
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
                  {/* Affiche ou vidéo mise en avant à droite du hero, et
                      reprise en fond de section (2026-08-17). */}
                  <ImageUploadField
                    label="Affiche ou vidéo (colonne de droite)"
                    allowVideo
                    value={selected.props.mediaUrl as string | undefined}
                    onChange={(mediaUrl) => updateSelectedProps({ mediaUrl })}
                  />
                  {Boolean(selected.props.mediaUrl) && (
                    <MediaAspectPicker
                      value={(selected.props.mediaAspect as MediaAspect) ?? '4:5'}
                      onChange={(mediaAspect) => updateSelectedProps({ mediaAspect })}
                    />
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Titre</label>
                    <Input
                      value={(selected.props.title as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ title: e.target.value })}
                    />
                  </div>
                  {/* Mot d'accent (2026-08-18) — choisi par l'organisateur et
                      jamais deviné : colorer d'office le dernier mot mettrait
                      en avant « 2026 » sur « Concert FESTA 2026 ». */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Mot mis en couleur (optionnel)
                    </label>
                    <Input
                      placeholder="Un mot du titre"
                      value={(selected.props.accentWord as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ accentWord: e.target.value })}
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Ce mot du titre prend la couleur d&apos;accent de votre thème. Laissez vide
                      pour un titre d&apos;une seule couleur.
                    </p>
                  </div>
                  {/* Accroche (2026-08-18) : la phrase qui vend, au-dessus de la
                      description. Deux niveaux de texte plutôt qu'un seul
                      bloc, qui n'hiérarchisait rien. */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Accroche (optionnel)
                    </label>
                    <Input
                      placeholder="Formation intensive : domptez la création de contenu"
                      value={(selected.props.lead as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ lead: e.target.value })}
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Affichée en gras juste sous le titre, avant la description de
                      l&apos;événement. Une phrase courte qui donne envie.
                    </p>
                  </div>
                  {/* Preuve sociale (2026-08-18) : une phrase sous les boutons,
                      sans portraits — le chiffre porte la crédibilité, des
                      visages inventés ne prouveraient rien. */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Phrase de réassurance (optionnel)
                    </label>
                    <Input
                      placeholder="Rejoint par +40 créateurs lors de la dernière session"
                      value={(selected.props.socialProof as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ socialProof: e.target.value })}
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Affichée sous les boutons du hero. Annoncez ce qui rassure : un nombre de
                      participants passés, une édition précédente. Laissez vide pour ne rien
                      afficher.
                    </p>
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

              {selected.type === 'video' && (
                <>
                  <ImageUploadField
                    label="Vidéo (MP4/WEBM) ou image"
                    allowVideo
                    value={selected.props.mediaUrl as string | undefined}
                    onChange={(mediaUrl) => updateSelectedProps({ mediaUrl })}
                  />
                  {Boolean(selected.props.mediaUrl) && (
                    <MediaAspectPicker
                      value={(selected.props.mediaAspect as MediaAspect) ?? '16:9'}
                      onChange={(mediaAspect) => updateSelectedProps({ mediaAspect })}
                    />
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">Titre (optionnel)</label>
                    <Input
                      value={(selected.props.title as string) ?? ''}
                      onChange={(e) => updateSelectedProps({ title: e.target.value })}
                    />
                  </div>
                </>
              )}

              {selected.type === 'testimonials' && (
                <TestimonialsEditor
                  title={(selected.props.title as string) ?? ''}
                  entries={(selected.props.entries as TestimonialEntry[] | undefined) ?? []}
                  onChangeTitle={(title) => updateSelectedProps({ title })}
                  onChangeEntries={(entries) => updateSelectedProps({ entries })}
                />
              )}

              {selected.type === 'timeline' && (
                <TimelineEditor
                  title={(selected.props.title as string) ?? ''}
                  entries={(selected.props.entries as TimelineEntry[] | undefined) ?? []}
                  onChangeTitle={(title) => updateSelectedProps({ title })}
                  onChangeEntries={(entries) => updateSelectedProps({ entries })}
                />
              )}

              {selected.type !== 'hero' &&
                selected.type !== 'text' &&
                selected.type !== 'tickets' &&
                selected.type !== 'html' &&
                selected.type !== 'countdown' &&
                selected.type !== 'timeline' &&
                selected.type !== 'testimonials' &&
                selected.type !== 'video' &&
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

const TIMELINE_ENTRIES_MAX = 12;

function TimelineEditor({
  title,
  entries,
  onChangeTitle,
  onChangeEntries,
}: {
  title: string;
  entries: TimelineEntry[];
  onChangeTitle: (title: string) => void;
  onChangeEntries: (entries: TimelineEntry[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold">Titre de la section</label>
        <Input
          placeholder="Notre histoire"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <Input
                  placeholder="Jalon (ex : L'indépendance du Togo)"
                  value={entry.label}
                  onChange={(e) =>
                    onChangeEntries(
                      entries.map((en) => (en.id === entry.id ? { ...en, label: e.target.value } : en)),
                    )
                  }
                />
                <Input
                  placeholder="Date (optionnel, texte libre — ex : 27 avril 1960)"
                  value={entry.date ?? ''}
                  onChange={(e) =>
                    onChangeEntries(
                      entries.map((en) => (en.id === entry.id ? { ...en, date: e.target.value } : en)),
                    )
                  }
                />
                <textarea
                  placeholder="Description (optionnel)"
                  value={entry.description ?? ''}
                  onChange={(e) =>
                    onChangeEntries(
                      entries.map((en) =>
                        en.id === entry.id ? { ...en, description: e.target.value } : en,
                      ),
                    )
                  }
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <button
                type="button"
                aria-label="Supprimer le jalon"
                onClick={() => onChangeEntries(entries.filter((en) => en.id !== entry.id))}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={entries.length >= TIMELINE_ENTRIES_MAX}
        onClick={() =>
          onChangeEntries([...entries, { id: crypto.randomUUID(), label: '', date: '', description: '' }])
        }
      >
        <Plus className="size-3.5" /> Ajouter un jalon
      </Button>
    </div>
  );
}

const TESTIMONIALS_MAX = 12;

/**
 * Éditeur du bloc « Témoignages » (2026-08-17). Même patron que la frise :
 * les entrées vivent dans `block.props`, pas dans le contenu centralisé —
 * pas de migration, et deux blocs peuvent porter des témoignages différents.
 */
function TestimonialsEditor({
  title,
  entries,
  onChangeTitle,
  onChangeEntries,
}: {
  title: string;
  entries: TestimonialEntry[];
  onChangeTitle: (title: string) => void;
  onChangeEntries: (entries: TestimonialEntry[]) => void;
}) {
  function patch(id: string, change: Partial<TestimonialEntry>) {
    onChangeEntries(entries.map((en) => (en.id === id ? { ...en, ...change } : en)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold">Titre de la section</label>
        <Input
          placeholder="Ce qu’ils en disent"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <textarea
                  placeholder="Le témoignage"
                  value={entry.quote}
                  onChange={(e) => patch(entry.id, { quote: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    placeholder="Auteur (optionnel)"
                    value={entry.author ?? ''}
                    onChange={(e) => patch(entry.id, { author: e.target.value })}
                  />
                  <Input
                    placeholder="Rôle (ex : Édition 2025)"
                    value={entry.role ?? ''}
                    onChange={(e) => patch(entry.id, { role: e.target.value })}
                  />
                </div>
                <ImageUploadField
                  label="Photo (optionnel)"
                  value={entry.avatarUrl || undefined}
                  onChange={(url) => patch(entry.id, { avatarUrl: url ?? '' })}
                />
              </div>
              <button
                type="button"
                aria-label="Supprimer le témoignage"
                onClick={() => onChangeEntries(entries.filter((en) => en.id !== entry.id))}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={entries.length >= TESTIMONIALS_MAX}
        onClick={() =>
          onChangeEntries([
            ...entries,
            { id: crypto.randomUUID(), quote: '', author: '', role: '' },
          ])
        }
      >
        <Plus className="size-3.5" /> Ajouter un témoignage
      </Button>
    </div>
  );
}

/**
 * Choix du format d'affiche (2026-08-17). On propose des formats RÉELS plutôt
 * qu'un recadrage automatique : une affiche verticale rognée en bandeau perd
 * exactement ce qu'elle montre.
 */
function MediaAspectPicker({
  value,
  onChange,
}: {
  value: MediaAspect;
  onChange: (value: MediaAspect) => void;
}) {
  const options = Object.keys(MEDIA_ASPECT_LABEL) as MediaAspect[];
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">Format du média</label>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
              value === option
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {MEDIA_ASPECT_LABEL[option]}
          </button>
        ))}
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

