'use client';

import { TicketPolicy, TicketSaleMode } from '@saas-events/types';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, Eye, EyeOff, MapPin, Plus, Settings2, Trash2, User, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { ColorField } from '@/components/ui/color-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { api, apiDelete, apiPatch, apiPost, ApiError } from '@/lib/api';
import { TicketingPanel, type EventDayDraft } from '../builder/ticketing-panel';

/**
 * Gestion des billets (CDC §6.3). Données réelles via GET /api/events/mine
 * (inclut les tickets) et POST /api/events/:eventId/tickets pour la création.
 */

interface TicketRow {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  stock: number;
  stockSold: number;
  maxPerOrder: number;
  isActive: boolean;
  // Champs ré-affichés par le formulaire d'édition. Sans eux, rouvrir un
  // billet montrait des cases vides là où des valeurs existaient — et depuis
  // que les dates peuvent être EFFACÉES (null), les réémettre vides les
  // aurait supprimées (2026-08-18).
  compareAtPrice: string | null;
  promoEndsAt: string | null;
  saleStartDate: string | null;
  saleEndDate: string | null;
  designImageUrl: string | null;
  designBgColor: string | null;
  designTextColor: string | null;
  // Rang d'affichage et bénéfices inclus (2026-08-18) — édités ici, rendus
  // par la page publique.
  category: string | null;
  features: string[];
  saleMode: TicketSaleMode;
  requestBadge: string | null;
  // Journée ouverte par ce billet en régime PER_DAY (2026-08-16).
  eventDayId: string | null;
}

interface EventWithTickets {
  id: string;
  tickets: TicketRow[];
  // Régime et journées (2026-08-16) — pilotent le champ « journée » du
  // formulaire : radio contraint en PER_DAY, texte libre sinon.
  ticketPolicy: TicketPolicy;
  days: Array<{
    id: string;
    label: string;
    date: string;
    // Lieu et horaires propres à la journée (2026-08-18) — affichés sur la
    // carte de journée à la création du billet.
    location: string | null;
    startTime: string | null;
    endTime: string | null;
  }>;
}

/**
 * ISO (UTC) → valeur d'un <input type="datetime-local">, qui n'accepte QUE
 * l'heure locale au format `YYYY-MM-DDTHH:mm`. Un `slice(0, 16)` sur l'ISO
 * afficherait l'heure UTC, décalée pour l'organisateur.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Saisie locale → ISO, ou `null` pour effacer la date côté serveur. */
function toIsoOrNull(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

/**
 * Zone de texte multiligne → tableau de bénéfices. Les lignes vides sont
 * écartées ici pour ne pas envoyer de bruit au serveur, mais c'est lui qui
 * fait autorité : il renettoie et tronque de son côté (RULES.md — le client
 * n'est jamais la garantie).
 */
function splitFeatures(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function ManagerTicketsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  // Défaut « plusieurs places, 10 » : le plafond 1 du schéma n'est presque
  // jamais l'intention d'un organisateur, et une case vide laisserait le
  // serveur trancher sans le dire.
  const [maxPerOrder, setMaxPerOrder] = useState('10');
  const [description, setDescription] = useState('');
  // Rang et bénéfices (2026-08-18) — voir la page publique, qui les regroupe
  // et les affiche en liste cochée. `features` est tenu comme UN texte
  // multiligne, pas comme un tableau : c'est ce que l'organisateur édite, et
  // convertir à chaque frappe ferait sauter le curseur sur une ligne vide.
  const [category, setCategory] = useState('');
  const [features, setFeatures] = useState('');
  // Mode de vente (2026-08-18) — `ON_REQUEST` sort le billet du tunnel d'achat,
  // côté page publique ET côté API.
  const [saleMode, setSaleMode] = useState<TicketSaleMode>(TicketSaleMode.ONLINE);
  const [requestBadge, setRequestBadge] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [promoEndsAt, setPromoEndsAt] = useState('');
  // Fenêtre de vente (2026-08-18) : le serveur la fait déjà respecter
  // (TICKET_SALE_NOT_STARTED / TICKET_SALE_ENDED), elle n'était saisissable
  // nulle part — les préventes étaient donc impossibles à mettre en place.
  const [saleStartDate, setSaleStartDate] = useState('');
  const [saleEndDate, setSaleEndDate] = useState('');
  const [dayLabel, setDayLabel] = useState('');
  const [eventDayId, setEventDayId] = useState<string | null>(null);
  const [designImageUrl, setDesignImageUrl] = useState<string | undefined>(undefined);
  const [designBgColor, setDesignBgColor] = useState<string | undefined>(undefined);
  // Pendant de designBgColor (2026-08-18) : le fond était réglable sans son
  // encre, ce qui permettait déjà de fabriquer un billet illisible.
  const [designTextColor, setDesignTextColor] = useState<string | undefined>(undefined);

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['manager-event'],
    queryFn: () => api<EventWithTickets>('/api/events/mine'),
  });

  // Régime de billetterie — état local jusqu’à l’enregistrement explicite,
  // comme le reste de cette page.
  const [policy, setPolicy] = useState<TicketPolicy>(TicketPolicy.SINGLE_DAY);
  const [days, setDays] = useState<EventDayDraft[]>([]);
  const [regimeLoaded, setRegimeLoaded] = useState(false);
  const [regimeDirty, setRegimeDirty] = useState(false);
  // Édition/suppression d’un billet (2026-08-17) et confirmation du
  // changement de régime, qui remet la billetterie à zéro.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<TicketRow | null>(null);
  const [confirmRegime, setConfirmRegime] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ isPremium: boolean }>('/api/auth/me'),
  });
  const isPremium = me?.isPremium ?? false;

  // Amorce unique : on ne réécrit pas l’état à chaque refetch, sinon une
  // saisie en cours serait écrasée par la version serveur.
  useEffect(() => {
    if (!event || regimeLoaded) return;
    setPolicy(event.ticketPolicy ?? TicketPolicy.SINGLE_DAY);
    setDays(
      (event.days ?? []).map((d) => ({
        label: d.label,
        date: d.date.slice(0, 10),
        // Sans ces trois lignes, ré-enregistrer les journées depuis cet écran
        // effacerait le lieu et les horaires saisis dans le Builder.
        location: d.location ?? '',
        startTime: d.startTime ?? '',
        endTime: d.endTime ?? '',
      })),
    );
    setRegimeLoaded(true);
  }, [event, regimeLoaded]);

  const saveRegime = useMutation({
    mutationFn: () =>
      apiPatch('/api/events/mine', {
        ticketPolicy: policy,
        // Une journée sans date est une ligne que l’utilisateur n’a pas finie :
        // on ne l’envoie pas plutôt que de faire échouer tout l’enregistrement.
        days: days.filter((d) => d.date),
      }),
    onSuccess: () => {
      toast.success('Régime enregistré');
      setRegimeDirty(false);
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'enregistrer le régime");
    },
  });

  const updateTicket = useMutation({
    mutationFn: () =>
      apiPatch(`/api/tickets/${editingId}`, {
        name,
        price: Number(price),
        description: description || undefined,
        category: category.trim(),
        saleMode,
        requestBadge: requestBadge.trim(),
        // Le formulaire ré-affiche les bénéfices : un champ vidé veut donc
        // dire « retire-les », d'où un tableau vide plutôt qu'`undefined`.
        features: splitFeatures(features),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
        // Le formulaire ré-affiche ces dates, donc une case vide veut bien
        // dire « retire-la » — d'où `null` et non `undefined`.
        promoEndsAt: toIsoOrNull(promoEndsAt),
        saleStartDate: toIsoOrNull(saleStartDate),
        saleEndDate: toIsoOrNull(saleEndDate),
        designImageUrl,
        designBgColor,
        designTextColor,
        // Figé dès la première vente (décision produit 2026-08-18) : le champ
        // est en lecture seule, et on ne le renvoie pas — le serveur refuse.
        maxPerOrder:
          (event?.tickets.find((t) => t.id === editingId)?.stockSold ?? 0) > 0
            ? undefined
            : maxPerOrder
              ? Number(maxPerOrder)
              : undefined,
        // `stock` est volontairement absent d’UpdateTicketDto côté serveur
        // (modifier la capacité après des ventes n’est pas tranché), et la
        // journée non plus : la changer déplacerait un billet déjà vendu.
      }),
    onSuccess: () => {
      toast.success('Billet modifié');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de modifier le billet");
    },
  });

  /**
   * Retrait / remise en vente (2026-08-18). `isActive` existait au modèle et
   * aux deux DTO, la liste affichait même un badge « Inactif » — mais rien ne
   * pouvait le produire. C'était pourtant la réponse que l'API conseille
   * elle-même quand la suppression est refusée faute de ventes.
   *
   * PATCH d'un seul champ : les dates absentes du corps restent inchangées
   * (voir `toNullableDate` côté service), il n'y a donc rien à ré-émettre.
   */
  const toggleActive = useMutation({
    mutationFn: (t: TicketRow) => apiPatch(`/api/tickets/${t.id}`, { isActive: !t.isActive }),
    onSuccess: (_data, t) => {
      toast.success(t.isActive ? `« ${t.name} » retiré de la vente` : `« ${t.name} » remis en vente`);
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de changer la disponibilité');
    },
  });

  const deleteTicket = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/tickets/${id}`),
    onSuccess: () => {
      toast.success('Billet supprimé');
      setTicketToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de supprimer le billet");
      setTicketToDelete(null);
    },
  });

  const createTicket = useMutation({
    mutationFn: () =>
      apiPost(`/api/events/${event!.id}/tickets`, {
        name,
        price: Number(price),
        stock: Number(stock),
        // Sans saisie, 10 : le défaut 1 du schéma empêchait toute commande
        // multiple, ce qui n’est presque jamais l’intention d’un organisateur.
        maxPerOrder: maxPerOrder ? Number(maxPerOrder) : 10,
        description: description || undefined,
        category: category.trim() || undefined,
        saleMode,
        requestBadge: requestBadge.trim() || undefined,
        features: splitFeatures(features),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
        promoEndsAt: promoEndsAt ? new Date(promoEndsAt).toISOString() : undefined,
        saleStartDate: saleStartDate ? new Date(saleStartDate).toISOString() : undefined,
        saleEndDate: saleEndDate ? new Date(saleEndDate).toISOString() : undefined,
        dayLabel: dayLabel || undefined,
        eventDayId: eventDayId ?? undefined,
        designImageUrl,
        designBgColor,
        designTextColor,
      }),
    onSuccess: () => {
      toast.success('Billet créé');
      setShowForm(false);
      setName('');
      setPrice('');
      setStock('');
      setMaxPerOrder('10');
      setDescription('');
      setCategory('');
      setFeatures('');
      setSaleMode(TicketSaleMode.ONLINE);
      setRequestBadge('');
      setCompareAtPrice('');
      setPromoEndsAt('');
      setSaleStartDate('');
      setSaleEndDate('');
      setDayLabel('');
      setDesignImageUrl(undefined);
      setDesignBgColor(undefined);
    setDesignTextColor(undefined);
      setDesignTextColor(undefined);
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de créer le billet');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger vos billets.
      </div>
    );
  }

  const totalSold = event.tickets.reduce((sum, t) => sum + t.stockSold, 0);

  // Régime EFFECTIF (celui du serveur), et non l’état local en cours
  // d’édition : le formulaire doit refléter ce qui est réellement enregistré,
  // sinon on proposerait des journées que l’API refuserait encore.
  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setPrice('');
    setStock('');
    setMaxPerOrder('10');
    setDescription('');
    setCategory('');
    setFeatures('');
    setSaleMode(TicketSaleMode.ONLINE);
    setRequestBadge('');
    setCompareAtPrice('');
    setPromoEndsAt('');
    setSaleStartDate('');
    setSaleEndDate('');
    setDayLabel('');
    setEventDayId(null);
    setDesignImageUrl(undefined);
    setDesignBgColor(undefined);
    setDesignTextColor(undefined);
  }

  function startEdit(t: TicketRow) {
    setEditingId(t.id);
    setName(t.name);
    setPrice(String(t.price));
    setStock(String(t.stock));
    setMaxPerOrder(String(t.maxPerOrder));
    setDescription(t.description ?? '');
    setCategory(t.category ?? '');
    setFeatures((t.features ?? []).join('\n'));
    // Tout ce que le formulaire réémet doit être ré-affiché, sinon
    // enregistrer sans y toucher effacerait la valeur existante.
    setCompareAtPrice(t.compareAtPrice ?? '');
    setPromoEndsAt(toLocalInput(t.promoEndsAt));
    setSaleStartDate(toLocalInput(t.saleStartDate));
    setSaleEndDate(toLocalInput(t.saleEndDate));
    setDesignImageUrl(t.designImageUrl ?? undefined);
    setDesignBgColor(t.designBgColor ?? undefined);
    setDesignTextColor(t.designTextColor ?? undefined);
    setShowForm(true);
  }

  // Ce qui est déjà vendu fige certains choix : on les affiche en lecture
  // seule plutôt que de les masquer, pour que la règle en vigueur reste
  // lisible (décision produit 2026-08-18, alignée sur le stock).
  const editingTicket = editingId ? event.tickets.find((t) => t.id === editingId) : undefined;
  const maxPerOrderLocked = (editingTicket?.stockSold ?? 0) > 0;
  const singleSeat = maxPerOrder === '1';
  // Une fenêtre inversée ne serait jamais ouverte : l'avertir ne suffit pas,
  // il faut empêcher d'enregistrer un billet invendable.
  const saleWindowInverted =
    Boolean(saleStartDate && saleEndDate) && new Date(saleEndDate) <= new Date(saleStartDate);

  const savedPolicy = event.ticketPolicy ?? TicketPolicy.SINGLE_DAY;
  const canCreateTickets =
    !regimeDirty && (savedPolicy !== TicketPolicy.PER_DAY || event.days.length > 0);
  const creationHint =
    savedPolicy === TicketPolicy.PER_DAY
      ? "Un billet par journée et par variante — chacun avec son propre prix."
      : savedPolicy === TicketPolicy.PASS_ALL_DAYS
        ? `Chaque billet vaudra pour les ${event.days.length} journées de l’événement.`
        : "Un billet, une entrée.";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billetterie</h1>
        <p className="text-sm text-muted-foreground">
          {event.tickets.length} type{event.tickets.length > 1 ? 's' : ''} de billet ·{' '}
          {totalSold.toLocaleString('fr-FR')} vendus
        </p>
      </div>

      {/* Deux étapes explicites (décision produit 2026-08-17) : on demande
          d'abord sur combien de jours se déroule l'événement, parce que la
          réponse change la façon dont les billets se créent ensuite. La
          saisie reste manuelle, billet par billet — chaque journée peut
          avoir ses propres variantes et ses propres prix. */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              1
            </span>
            <div>
              <h2 className="text-sm font-semibold">Votre événement se déroule sur…</h2>
              <p className="text-xs text-muted-foreground">
                Ce choix décide de ce que le scanner autorisera à l&apos;entrée.
              </p>
            </div>
          </div>
          {isPremium && <Badge variant="success">Premium</Badge>}
        </div>

        <TicketingPanel
          policy={policy}
          days={days}
          isPremium={isPremium}
          onPolicyChange={(next) => {
            setPolicy(next);
            setRegimeDirty(true);
            // Repasser en mono-jour vide la liste : la conserver enverrait des
            // journées que le serveur refuserait dans ce régime.
            if (next === TicketPolicy.SINGLE_DAY) setDays([]);
          }}
          onDaysChange={(next) => {
            setDays(next);
            setRegimeDirty(true);
          }}
        />

        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              // Changer de régime efface les billets : on ne le fait jamais
              // sans validation explicite quand il y en a déjà.
              if (policy !== savedPolicy && event.tickets.length > 0) {
                setConfirmRegime(true);
                return;
              }
              saveRegime.mutate();
            }}
            disabled={saveRegime.isPending}
          >
            {saveRegime.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
          {regimeDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              Enregistrez avant d&apos;ajouter vos billets
            </span>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              2
            </span>
            <div>
              <h2 className="text-sm font-semibold">Créez vos billets</h2>
              <p className="text-xs text-muted-foreground">{creationHint}</p>
            </div>
          </div>
          <Button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            disabled={!canCreateTickets && !showForm}
          >
            {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
            {showForm ? 'Annuler' : 'Ajouter un billet'}
          </Button>
        </div>

        {/* En « billet par jour », le manager crée une ligne par journée et
            par variante : ce décompte lui montre ce qu'il reste à faire,
            plutôt que de le lui faire tenir de tête. */}
        {savedPolicy === TicketPolicy.PER_DAY && event.days.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {event.days.map((d) => {
              const count = event.tickets.filter((t) => t.eventDayId === d.id).length;
              return (
                <div
                  key={d.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                    count === 0 ? 'border-dashed border-amber-500/50' : 'border-border'
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{d.label}</span>
                  <span className={count === 0 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}>
                    {count === 0 ? 'aucun billet' : `${count} billet${count > 1 ? 's' : ''}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {savedPolicy === TicketPolicy.PER_DAY && event.days.length === 0 && (
          <p className="rounded-lg border border-dashed border-amber-500/50 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-500">
            Déclarez d&apos;abord vos journées à l&apos;étape 1 : en « billet par jour », chaque
            billet doit ouvrir une journée précise.
          </p>
        )}
      </Card>

      {showForm && (
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingId) updateTicket.mutate();
              else createTicket.mutate();
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4"
          >
            <input
              required
              placeholder="Nom (ex: VIP)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Prix (XOF)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {/* Mode d'achat (2026-08-18). Un nombre à taper n'apprend rien à qui
                ignore sa conséquence : deux options NOMMÉES disent ce qui se
                passera à l'achat. Le mode se déduit du plafond — pas de second
                état à tenir synchronisé. Figé dès la première vente : les
                acheteurs suivants joueraient sinon sous une autre règle. */}
            <fieldset className="md:col-span-2">
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
                Combien de places par commande ?
              </legend>
              {maxPerOrderLocked ? (
                <p
                  id="max-per-order-lock"
                  className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  {singleSeat
                    ? 'Une place par commande.'
                    : `Jusqu'à ${maxPerOrder} places par commande.`}{' '}
                  <span className="font-medium">
                    Figé : {editingTicket?.stockSold} place(s) déjà vendue(s) sous cette règle.
                  </span>
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    {
                      value: '1',
                      icon: User,
                      title: 'Une place par commande',
                      hint: 'Billet nominatif, ou catégorie rare.',
                    },
                    {
                      value: '10',
                      icon: Users,
                      title: 'Plusieurs places',
                      hint: 'L’acheteur choisit sa quantité.',
                    },
                  ].map((opt) => {
                    const selected = opt.value === '1' ? singleSeat : !singleSeat;
                    const Icon = opt.icon;
                    return (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-all focus-within:ring-2 focus-within:ring-ring ${
                          selected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/40 hover:bg-accent/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="purchase-mode"
                          checked={selected}
                          // Repasser en « plusieurs » restaure 10 plutôt que de
                          // rendre la main sur un champ vide.
                          onChange={() => setMaxPerOrder(opt.value)}
                          className="sr-only"
                        />
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold">{opt.title}</span>
                          <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {/* Le nombre n'a de sens que dans le second cas — l'afficher
                  toujours ramènerait la case nue qu'on vient de remplacer.
                  min=2 : « 1 » est l'AUTRE carte, pas une valeur d'ici. */}
              {!maxPerOrderLocked && !singleSeat && (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  Plafond
                  <input
                    type="number"
                    min="2"
                    placeholder="10"
                    value={maxPerOrder}
                    onChange={(e) => setMaxPerOrder(e.target.value)}
                    aria-label="Nombre maximum de places par commande"
                    className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  places
                </label>
              )}
            </fieldset>
            <input
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {/* Rang d'affichage : la colonne existait en base depuis l'origine
                mais n'était saisissable nulle part — donc jamais remplie, donc
                invisible sur la page publique (2026-08-18). */}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Rang sur la page publique (optionnel)
              <input
                placeholder="Ex. Pass individuel"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[11px]">
                Les billets portant le même rang sont regroupés sous ce libellé.
              </span>
            </label>
            {/* Mode de vente (2026-08-18) : les formules négociées — tables,
                packages groupe — étaient jusqu'ici fabriquées en billets
                fictifs, annulés à la main après chaque demande. */}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Mode de vente
              <select
                value={saleMode}
                onChange={(e) => setSaleMode(e.target.value as TicketSaleMode)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value={TicketSaleMode.ONLINE}>Achat en ligne</option>
                <option value={TicketSaleMode.ON_REQUEST}>Sur réservation (WhatsApp)</option>
              </select>
              {saleMode === TicketSaleMode.ON_REQUEST && (
                <span className="text-[11px] leading-relaxed">
                  La formule s&apos;affiche sur la page publique avec un bouton WhatsApp vers le
                  numéro de l&apos;événement. Rien n&apos;est encaissé : le prix indiqué n&apos;est
                  qu&apos;un ordre de grandeur, et le billet ne peut pas entrer dans un panier.
                </span>
              )}
            </label>

            {saleMode === TicketSaleMode.ON_REQUEST && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Pastille de qualification (optionnel)
                <input
                  placeholder="Ex. Sur réservation"
                  maxLength={60}
                  value={requestBadge}
                  onChange={(e) => setRequestBadge(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="text-[11px]">
                  Affichée au-dessus du nom, avant la formule — c&apos;est une condition
                  d&apos;accès, elle se lit en premier.
                </span>
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ce que le billet inclut (optionnel)
              <textarea
                rows={4}
                placeholder={'Une ligne par élément\nEx. Accès Jour 1\nEx. Espace food & bar'}
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[11px]">
                Affiché en liste cochée sur la page publique — 12 lignes maximum, 80 caractères
                chacune. C&apos;est ce qui permet à un acheteur de comparer deux formules d&apos;un
                coup d&apos;œil.
              </span>
            </label>
            <input
              type="number"
              min="0"
              placeholder="Prix barré avant promo (optionnel)"
              value={compareAtPrice}
              onChange={(e) => setCompareAtPrice(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Fin de la promo (optionnel)
              <input
                type="datetime-local"
                value={promoEndsAt}
                onChange={(e) => setPromoEndsAt(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            {/* Fenêtre de vente (2026-08-18) : l'API refusait déjà l'achat
                hors de cette fenêtre, mais aucun écran ne permettait de la
                définir — le mécanisme existait sans être atteignable. */}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ouverture des ventes (optionnel)
              <input
                type="datetime-local"
                value={saleStartDate}
                onChange={(e) => setSaleStartDate(e.target.value)}
                max={saleEndDate || undefined}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Clôture des ventes (optionnel)
              <input
                type="datetime-local"
                value={saleEndDate}
                onChange={(e) => setSaleEndDate(e.target.value)}
                min={saleStartDate || undefined}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            {saleWindowInverted && (
              <p className="text-[11px] text-amber-600 md:col-span-4 dark:text-amber-500">
                La clôture doit venir après l&apos;ouverture, sinon le billet ne sera jamais en
                vente.
              </p>
            )}
            {/* Régime PER_DAY (2026-08-16) : la journée remplace le libellé
                libre — c'est elle que le scanner contrôlera à l'entrée, alors
                que `dayLabel` n'a jamais été que du texte d'affichage. */}
            {savedPolicy === TicketPolicy.PER_DAY ? (
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Journée ouverte par ce billet
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {event.days.map((d) => {
                    const selected = eventDayId === d.id;
                    return (
                      <label
                        key={d.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition-all focus-within:ring-2 focus-within:ring-ring ${
                          selected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/40 hover:bg-accent/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="event-day"
                          value={d.id}
                          checked={selected}
                          onChange={() => setEventDayId(d.id)}
                          className="sr-only"
                        />
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <CalendarDays className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{d.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
                              new Date(d.date),
                            )}
                            {d.startTime && ` · ${d.startTime}${d.endTime ? `–${d.endTime}` : ''}`}
                          </span>
                          {/* Choisir la journée, c'est choisir un lieu et une
                              heure (2026-08-18). Les afficher ici évite au
                              manager d'aller les vérifier ailleurs — et rend
                              visible la journée dont le lieu manque encore. */}
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">
                              {d.location || 'Lieu de l’événement'}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {event.days.length === 0 && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-500">
                    Aucune journée déclarée. Ajoutez-en depuis l&apos;onglet Config du Builder.
                  </span>
                )}
              </label>
            ) : savedPolicy === TicketPolicy.PASS_ALL_DAYS ? (
              // Un pass couvre toutes les journées : proposer un champ
              // « Jour » laisserait croire à une restriction qui n’existe pas.
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground md:col-span-2">
                Ce billet vaudra pour les {event.days.length} journées de l’événement.
              </p>
            ) : (
              <input
                placeholder="Jour (ex: Jour 1 — Samedi 8 Août, optionnel)"
                value={dayLabel}
                onChange={(e) => setDayLabel(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            )}
            <div className="md:col-span-4 grid gap-3 md:grid-cols-3">
              <ImageUploadField
                label="Image de design du billet (optionnel)"
                value={designImageUrl}
                onChange={setDesignImageUrl}
              />
              <ColorField
                label="Couleur de fond du billet (optionnel)"
                value={designBgColor}
                onChange={setDesignBgColor}
              />
              {/* Le fond sans l'encre laissait fabriquer un billet illisible
                  (texte sombre sur fond sombre) sans aucun recours. */}
              <ColorField
                label="Couleur du texte du billet (optionnel)"
                value={designTextColor}
                onChange={setDesignTextColor}
              />
            </div>
            <div className="md:col-span-4 flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={createTicket.isPending || updateTicket.isPending || saleWindowInverted}
                className="w-fit"
              >
                {createTicket.isPending || updateTicket.isPending
                  ? 'Enregistrement...'
                  : editingId
                    ? 'Enregistrer les modifications'
                    : 'Créer le billet'}
              </Button>
              {editingId && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                    Annuler
                  </Button>
                  {/* Le stock et la journée ne sont pas modifiables : côté
                      serveur `stock` est absent du DTO de mise à jour, et
                      déplacer un billet d’une journée à l’autre invaliderait
                      les QR déjà émis. */}
                  <span className="text-xs text-muted-foreground">
                    Le stock et la journée ne se modifient pas après création.
                  </span>
                </>
              )}
            </div>
          </form>
        </Card>
      )}

      {event.tickets.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Aucun type de billet pour le moment.
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="border-b border-border px-4.5 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {event.tickets.length} type{event.tickets.length > 1 ? 's' : ''} de billet
            </span>
          </div>
          {event.tickets.map((t, i) => {
            const percent = t.stock > 0 ? Math.round((t.stockSold / t.stock) * 100) : 0;
            const soldOut = t.stockSold >= t.stock;
            return (
              <div
                key={t.id}
                className={`flex flex-wrap items-center justify-between gap-3 px-4.5 py-3.5 ${
                  i < event.tickets.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                </div>
                <div className="text-sm font-semibold">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: t.currency }).format(Number(t.price))}
                </div>
                <div className="w-full sm:w-40">
                  <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${soldOut ? 'bg-muted-foreground' : 'bg-primary'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.stockSold} / {t.stock} vendus
                  </div>
                </div>
                <Badge variant={!t.isActive ? 'outline' : soldOut ? 'secondary' : 'success'} className="w-fit">
                  {!t.isActive ? 'Inactif' : soldOut ? 'Épuisé' : 'Actif'}
                </Badge>

                {/* Actions par billet (2026-08-17) : la liste était en lecture
                    seule, sans aucun moyen de corriger un prix ou de retirer
                    une ligne créée par erreur. */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate(t)}
                    disabled={toggleActive.isPending}
                    aria-label={t.isActive ? `Retirer ${t.name} de la vente` : `Remettre ${t.name} en vente`}
                    aria-pressed={!t.isActive}
                    title={
                      t.isActive
                        ? 'Retirer de la vente — le billet disparaît de la page publique, rien n’est supprimé'
                        : 'Remettre en vente'
                    }
                    className={`rounded-md p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      t.isActive
                        ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        : 'text-amber-600 hover:bg-amber-500/10 dark:text-amber-500'
                    }`}
                  >
                    {t.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    aria-label={`Modifier ${t.name}`}
                    title="Modifier"
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Settings2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTicketToDelete(t)}
                    aria-label={`Supprimer ${t.name}`}
                    title={
                      t.stockSold > 0
                        ? 'Billet déjà vendu — désactivez-le plutôt'
                        : 'Supprimer'
                    }
                    // Un billet vendu ne peut pas être supprimé : la base le
                    // refuse (clé étrangère vers les commandes). Le bouton le
                    // dit avant le clic plutôt qu'après.
                    disabled={t.stockSold > 0}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <ConfirmDialog
        open={confirmRegime}
        title="Changer le déroulement effacera vos billets"
        description={
          <>
            Vos <strong>{event.tickets.length} billet
            {event.tickets.length > 1 ? 's' : ''}</strong> ont été créés pour le régime actuel et
            n’auraient plus de sens dans le nouveau. Ils seront supprimés pour repartir sur une
            base saine. Cette action est irréversible.
          </>
        }
        confirmLabel="Changer et effacer"
        pending={saveRegime.isPending}
        onConfirm={() => {
          setConfirmRegime(false);
          saveRegime.mutate();
        }}
        onCancel={() => setConfirmRegime(false)}
      />

      <ConfirmDialog
        open={ticketToDelete !== null}
        title="Supprimer ce billet ?"
        description={
          <>
            <strong>{ticketToDelete?.name}</strong> sera définitivement supprimé. Aucune vente
            n’est enregistrée dessus.
          </>
        }
        confirmLabel="Supprimer"
        pending={deleteTicket.isPending}
        onConfirm={() => ticketToDelete && deleteTicket.mutate(ticketToDelete.id)}
        onCancel={() => setTicketToDelete(null)}
      />
    </div>
  );
}
