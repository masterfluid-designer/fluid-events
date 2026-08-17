'use client';

import { TicketPolicy } from '@saas-events/types';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { ColorField } from '@/components/ui/color-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { api, apiPatch, apiPost, ApiError } from '@/lib/api';
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
  isActive: boolean;
}

interface EventWithTickets {
  id: string;
  tickets: TicketRow[];
  // Régime et journées (2026-08-16) — pilotent le champ « journée » du
  // formulaire : radio contraint en PER_DAY, texte libre sinon.
  ticketPolicy: TicketPolicy;
  days: Array<{ id: string; label: string; date: string }>;
}

export default function ManagerTicketsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [promoEndsAt, setPromoEndsAt] = useState('');
  const [dayLabel, setDayLabel] = useState('');
  const [eventDayId, setEventDayId] = useState<string | null>(null);
  const [designImageUrl, setDesignImageUrl] = useState<string | undefined>(undefined);
  const [designBgColor, setDesignBgColor] = useState<string | undefined>(undefined);

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
    setDays((event.days ?? []).map((d) => ({ label: d.label, date: d.date.slice(0, 10) })));
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

  const createTicket = useMutation({
    mutationFn: () =>
      apiPost(`/api/events/${event!.id}/tickets`, {
        name,
        price: Number(price),
        stock: Number(stock),
        description: description || undefined,
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : undefined,
        promoEndsAt: promoEndsAt ? new Date(promoEndsAt).toISOString() : undefined,
        dayLabel: dayLabel || undefined,
        eventDayId: eventDayId ?? undefined,
        designImageUrl,
        designBgColor,
      }),
    onSuccess: () => {
      toast.success('Billet créé');
      setShowForm(false);
      setName('');
      setPrice('');
      setStock('');
      setDescription('');
      setCompareAtPrice('');
      setPromoEndsAt('');
      setDayLabel('');
      setDesignImageUrl(undefined);
      setDesignBgColor(undefined);
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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Types de billets</h1>
          <p className="text-sm text-muted-foreground">
            {event.tickets.length} type{event.tickets.length > 1 ? 's' : ''} · {totalSold.toLocaleString('fr-FR')} vendus
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? 'Annuler' : 'Ajouter un billet'}
        </Button>
      </div>

      {/* Régime de billetterie (décision produit 2026-08-16) — sa place est
          ici, avec les billets, et non dans l'onglet Config du Builder qui
          sert au contenu de la page publique. Un manager cherchant cette
          option la cherche dans « Billets ». */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Régime de billetterie</h2>
            <p className="text-xs text-muted-foreground">
              Ce que le scanner autorisera à l&apos;entrée.
            </p>
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
          <Button size="sm" onClick={() => saveRegime.mutate()} disabled={saveRegime.isPending}>
            {saveRegime.isPending ? 'Enregistrement...' : 'Enregistrer le régime'}
          </Button>
          {regimeDirty && (
            <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
          )}
        </div>
      </Card>

      {showForm && (
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTicket.mutate();
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
            <input
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
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
            {/* Régime PER_DAY (2026-08-16) : la journée remplace le libellé
                libre — c'est elle que le scanner contrôlera à l'entrée, alors
                que `dayLabel` n'a jamais été que du texte d'affichage. */}
            {event.ticketPolicy === TicketPolicy.PER_DAY ? (
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
            ) : (
              <input
                placeholder="Jour (ex: Jour 1 — Samedi 8 Août, optionnel)"
                value={dayLabel}
                onChange={(e) => setDayLabel(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            )}
            <div className="md:col-span-4 grid gap-3 md:grid-cols-2">
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
            </div>
            <Button type="submit" disabled={createTicket.isPending} className="md:col-span-4 w-fit">
              {createTicket.isPending ? 'Création...' : 'Créer le billet'}
            </Button>
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
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
