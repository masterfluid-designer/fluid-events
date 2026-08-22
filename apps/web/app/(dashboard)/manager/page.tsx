'use client';

import { StatGrid } from '@/components/dashboard/stat-grid';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserCheck, Users, Sparkles, DollarSign, Ticket, ScanLine, Radio, Clock, AlertTriangle, Rocket, Plus } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { SalesTrendChart, type DailySalesPoint } from '@/components/ui/sales-trend-chart';
import { api, apiPatch, apiPost, ApiError } from '@/lib/api';
import { PublicLink } from '@/components/dashboard/public-link';
import { avecEvenement, useEvenementActif, useMesEvenements } from '@/lib/evenement-actif';
import { EventAccessMode } from '@saas-events/types';

/**
 * Dashboard Manager (CDC §14.3 — KPIs événement géré).
 * En V1, 1 Manager = 1 Événement (CDC §1.4). Données réelles via
 * GET /api/events/mine/overview (agrégées à la volée depuis Order/OrderItem/ScannerLog).
 */

interface Overview {
  event: {
    id: string;
    title: string;
    slug: string;
    status: string;
    /** Régime d'accès — commande les chiffres montrés (2026-08-22). */
    accessMode?: EventAccessMode;
  };
  inscriptions: number;
  inscriptionsPresentes: number;
  inscriptionsOverTime: DailySalesPoint[];
  totalRevenue: number;
  currency: string;
  ticketsSold: number;
  revenueByTicketType: Array<{ name: string; revenue: number; count: number }>;
  salesOverTime: DailySalesPoint[];
  fillRateByTicketType: Array<{ name: string; stock: number; stockSold: number; fillRate: number }>;
  scansByScanner: Array<{ name: string; scans: number; lastScanAt: string | null }>;
  paymentStatus: { configured: boolean; provider: string | null };
}

/**
 * Le régime d'accès n'était affiché NULLE PART sur le tableau de bord
 * (2026-08-22). Un organisateur ne pouvait pas savoir si sa page vendait des
 * billets ou recueillait des inscriptions — sinon en la visitant.
 */
const REGIME_LABELS: Record<string, string> = {
  TICKETED_ACCOUNT: 'Billetterie · compte requis',
  TICKETED_GUEST: 'Billetterie · sans compte',
  RSVP: 'Inscription simple',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
};

export default function ManagerDashboardPage() {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [creationOuverte, setCreationOuverte] = useState(false);
  // L'événement porté par l'URL (2026-08-21). Absent, le serveur retombe
  // sur celui du manager mono-événement — le cas de tous jusqu'ici.
  const evenement = useEvenementActif();

  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['manager-overview', evenement],
    queryFn: () => api<Overview>(avecEvenement('/api/events/mine/overview', evenement)),
    retry: false,
  });

  // Palier Premium — le manager n’avait aucun moyen de savoir qu’il l’a.
  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ plan?: 'FREE' | 'PREMIUM' }>('/api/auth/me'),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'PUBLISHED' | 'CANCELLED') =>
      apiPatch(avecEvenement('/api/events/mine', evenement), { status }),
    onSuccess: (_data, status) => {
      toast.success(status === 'CANCELLED' ? 'Événement annulé' : 'Événement republié');
      setConfirmingCancel(false);
      queryClient.invalidateQueries({ queryKey: ['manager-overview'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de changer le statut de l'événement");
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError && error instanceof ApiError && error.code === 'EVENT_NOT_FOUND') {
    return <CreateFirstEventOnboarding />;
  }

  // Même formulaire que le tout premier événement : les champs à remplir
  // sont les mêmes, et un second écran n'apprendrait rien à personne.
  if (creationOuverte) {
    return <CreateFirstEventOnboarding onAnnuler={() => setCreationOuverte(false)} />;
  }

  /*
   * Le serveur refuse de choisir entre plusieurs événements. C'est un état de
   * PASSAGE : le sélecteur écrit l'identifiant dans l'URL au montage, et la
   * requête repart aussitôt. Afficher « impossible de charger » ferait
   * craindre une panne là où il ne se passe qu'un aller-retour.
   */
  if (isError && error instanceof ApiError && error.code === 'EVENT_SELECTION_REQUIRED') {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger les statistiques de votre événement.
      </div>
    );
  }

  const totalScans = overview.scansByScanner.reduce((sum, s) => sum + s.scans, 0);
  const scanRate = overview.ticketsSold > 0 ? Math.round((totalScans / overview.ticketsSold) * 100) : 0;
  const currencyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: overview.currency });
  const maxTicketRevenue = Math.max(1, ...overview.revenueByTicketType.map((r) => r.revenue));

  const surInscription = overview.event.accessMode === EventAccessMode.RSVP;

  /*
   * Les indicateurs suivent le RÉGIME. Un événement sur inscription n'a ni
   * revenus ni billets : lui montrer « 0 F · 0 billet vendu » pendant que sa
   * liste se remplit était un écran qui ment. On répond à la même question —
   * « où en suis-je ? » — avec les chiffres qui existent.
   */
  const tauxPresence =
    overview.inscriptions > 0
      ? Math.round((overview.inscriptionsPresentes / overview.inscriptions) * 100)
      : 0;

  const stats = surInscription
    ? [
        {
          label: 'Inscrits',
          value: overview.inscriptions.toLocaleString('fr-FR'),
          icon: <Users className="size-4" />,
        },
        {
          label: 'Arrivées',
          value: overview.inscriptionsPresentes.toLocaleString('fr-FR'),
          icon: <UserCheck className="size-4" />,
        },
        {
          label: 'Taux de présence',
          value: `${tauxPresence}%`,
          icon: <ScanLine className="size-4" />,
        },
        {
          label: 'Agents de contrôle',
          value: overview.scansByScanner.length.toString(),
          icon: <Radio className="size-4" />,
        },
      ]
    : [
        { label: 'Revenus', value: currencyFmt.format(overview.totalRevenue), icon: <DollarSign className="size-4" /> },
        { label: 'Billets vendus', value: overview.ticketsSold.toLocaleString('fr-FR'), icon: <Ticket className="size-4" /> },
        { label: 'Taux de scan', value: `${scanRate}%`, icon: <ScanLine className="size-4" /> },
        { label: 'Scanners actifs', value: overview.scansByScanner.length.toString(), icon: <Radio className="size-4" /> },
      ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{overview.event.title}</h1>
          <p className="text-sm text-muted-foreground">Tableau de bord de votre événement</p>
          {/* L’adresse publique était introuvable depuis le dashboard : le
              Manager devait la reconstituer de tête depuis son slug. */}
          <div className="mt-3 max-w-xl">
            <PublicLink slug={overview.event.slug} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              overview.event.status === 'PUBLISHED'
                ? 'success'
                : overview.event.status === 'CANCELLED'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            ● {STATUS_LABELS[overview.event.status] ?? overview.event.status}
          </Badge>
          {/* Le régime, jamais affiché jusqu’ici : il décide de ce que la page
              publique propose, et donc de ce que ce tableau de bord montre. */}
          <Badge variant="secondary" title="Modifiable depuis Apparence › Régime d’accès">
            {REGIME_LABELS[overview.event.accessMode ?? 'TICKETED_ACCOUNT'] ??
              overview.event.accessMode}
          </Badge>
          {me?.plan === 'PREMIUM' && (
            <Badge variant="success" title="Options avancées débloquées, dont les événements sur plusieurs jours">
              <Sparkles className="mr-1 size-3" /> Premium
            </Badge>
          )}
          <BoutonNouvelEvenement plan={me?.plan} onCreer={() => setCreationOuverte(true)} />
          {overview.event.status === 'PUBLISHED' && !confirmingCancel && (
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
              Annuler l&apos;événement
            </Button>
          )}
          {overview.event.status === 'PUBLISHED' && confirmingCancel && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <span className="text-xs text-muted-foreground">
                Les billets déjà vendus restent valides en base, sans remboursement automatique. Confirmer ?
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('CANCELLED')}
              >
                {setStatus.isPending ? 'Annulation...' : 'Confirmer'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                Retour
              </Button>
            </div>
          )}
          {overview.event.status === 'CANCELLED' && (
            <Button
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('PUBLISHED')}
            >
              Republier l&apos;événement
            </Button>
          )}
          {/* Un événement naît en DRAFT et sa page publique répond 404 tant
              qu’il n’est pas publié. Sans ce bouton il n’existait AUCUN moyen
              de le publier depuis l’interface — impasse complète. */}
          {overview.event.status === 'DRAFT' && (
            <Button
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('PUBLISHED')}
            >
              {setStatus.isPending ? 'Publication...' : "Publier l’événement"}
            </Button>
          )}
        </div>
      </div>

      {overview.event.status === 'DRAFT' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
          <span className="inline-block size-2 rounded-full bg-amber-500" />
          Votre événement est en brouillon : sa page publique répond « introuvable » tant
          qu&apos;il n&apos;est pas publié.
        </div>
      )}

      {/* Sans billetterie, il n’y a rien à encaisser : afficher un statut de
          paiement — ou en réclamer la configuration — est du bruit pour un
          organisateur qui n’en veut pas. */}
      {!surInscription && (overview.paymentStatus.configured ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          Paiement actif : <span className="font-semibold">{overview.paymentStatus.provider}</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Aucun moyen de paiement n&apos;est configuré pour votre événement — vos clients ne peuvent pas encore
            acheter de billets. <span className="font-semibold">Contactez l&apos;administrateur de la plateforme</span> pour
            activer les paiements.
          </span>
        </div>
      ))}

      <StatGrid stats={stats} />

      {/* Les blocs suivants n’ont de sens que si l’on vend. En régime
          « inscription simple », ils affichaient des cadres vides — un écran
          qui laisse croire à une panne plutôt qu’à une absence de
          billetterie. */}
      {!surInscription && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenus par type de billet</CardTitle>
          <CardDescription>Répartition des ventes confirmées</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.revenueByTicketType.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune vente confirmée pour le moment.</p>
          ) : (
            overview.revenueByTicketType.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.count} billet{row.count > 1 ? 's' : ''} • {currencyFmt.format(row.revenue)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((row.revenue / maxTicketRevenue) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes dans le temps</CardTitle>
          <CardDescription>Revenus confirmés par jour, 30 derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesTrendChart data={overview.salesOverTime} currency={overview.currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taux de remplissage</CardTitle>
          <CardDescription>Billets vendus par rapport au stock configuré</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.fillRateByTicketType.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun type de billet configuré.</p>
          ) : (
            overview.fillRateByTicketType.map((row) => (
              <div key={row.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.stockSold} / {row.stock} • {row.fillRate}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${row.fillRate >= 90 ? 'bg-destructive' : 'bg-accent-terracotta dark:bg-accent-terracotta-dark'}`}
                    style={{ width: `${Math.min(row.fillRate, 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      </>
      )}

      {/* Ce qui progresse dans le temps sur un événement sur inscription, ce
          sont les inscrits — même série, autre unité. */}
      {surInscription && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inscriptions dans le temps</CardTitle>
            <CardDescription>Nouvelles inscriptions par jour, 30 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesTrendChart
              data={overview.inscriptionsOverTime}
              currency={overview.currency}
              unite="nombre"
              messageVide="Aucune inscription sur les 30 derniers jours."
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> Activité scanners
          </CardTitle>
          <CardDescription>Scans valides par point d&apos;accès</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {overview.scansByScanner.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun scanner configuré pour cet événement.</p>
          ) : (
            overview.scansByScanner.map((sc) => (
              <div
                key={sc.name}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <div className="font-medium">{sc.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {sc.lastScanAt
                      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(
                          new Date(sc.lastScanAt),
                        )
                      : 'Aucun scan'}
                  </div>
                </div>
                <Badge variant="secondary">{sc.scans}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function slugify(title: string): string {
  return title
    .normalize('NFD')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      // Strips Unicode combining diacritical marks (U+0300–U+036F) left over
      // after NFD decomposition (e.g. "é" -> "e" + U+0301) — deliberately
      // avoids a literal Unicode regex range here (encoding footgun).
      return code < 0x0300 || code > 0x036f;
    })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Création d'un événement SUPPLÉMENTAIRE (2026-08-21) — réservée au palier
 * Premium, plafonnée à huit par le serveur. Le bouton ne s’affiche que
 * lorsqu'il y a quelque chose à créer : un manager FREE, qui a déjà son
 * unique événement, ne doit pas voir une porte qui se refermera sur lui.
 */
function BoutonNouvelEvenement({
  plan,
  onCreer,
}: {
  plan?: 'FREE' | 'PREMIUM';
  onCreer: () => void;
}) {
  const { data: evenements } = useMesEvenements();
  if (plan !== 'PREMIUM') return null;

  const nombre = evenements?.length ?? 0;
  const maximum = 8;
  if (nombre >= maximum) return null;

  return (
    <Button variant="outline" size="sm" onClick={onCreer}>
      <Plus className="size-4" />
      Nouvel événement
      <span className="text-muted-foreground">
        {nombre}/{maximum}
      </span>
    </Button>
  );
}

/**
 * Onboarding affiché quand le Manager authentifié n'a pas encore
 * d'événement (EVENT_NOT_FOUND sur /api/events/mine/overview) — notamment
 * les comptes self-service Google fraîchement créés (CDC §14.3, décision
 * produit 2026-07-14 : 1 Manager = 1 Event en V1, il faut donc pouvoir créer
 * ce premier événement depuis le dashboard plutôt que rester bloqué).
 */
function CreateFirstEventOnboarding({ onAnnuler }: { onAnnuler?: () => void } = {}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [location, setLocation] = useState('');
  // Localisation exacte + contact + capacité (décision produit 2026-08-16).
  const [venueName, setVenueName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [expectedAttendees, setExpectedAttendees] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiPost('/api/events', {
        title,
        slug,
        location: location || undefined,
        venueName: venueName || undefined,
        addressLine: addressLine || undefined,
        city: city || undefined,
        country: country || undefined,
        accessNotes: accessNotes || undefined,
        contactPhone: contactPhone || undefined,
        expectedAttendees: expectedAttendees ? Number(expectedAttendees) : undefined,
        description: description || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Événement créé ! Configurez vos billets et votre page depuis ce dashboard.');
      // La liste alimente le sélecteur : sans cette invalidation, le nouvel
      // événement resterait invisible jusqu’au prochain rechargement.
      queryClient.invalidateQueries({ queryKey: ['mes-evenements'] });
      queryClient.invalidateQueries({ queryKey: ['manager-overview'] });
      onAnnuler?.();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de créer l'événement");
    },
  });

  return (
    <div className="flex justify-center p-6">
      <Card className="w-full max-w-2xl p-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-terracotta/15 text-accent-terracotta dark:text-accent-terracotta-dark">
            <Rocket className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Créez votre premier événement</h1>
            <p className="text-sm text-muted-foreground">
              Votre compte n&apos;a encore aucun événement — renseignez les informations de base pour démarrer.
              Vous pourrez ensuite configurer vos billets et personnaliser votre page.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Titre de l&apos;événement</label>
            <Input
              required
              placeholder="Concert FESTA 2026"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Slug (URL publique : /e/{slug || '...'})
            </label>
            <Input
              required
              placeholder="concert-festa-2026"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Début</label>
            <Input
              required
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fin</label>
            <Input
              required
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Lieu (optionnel)</label>
            <Input placeholder="Abidjan, Côte d'Ivoire" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          {/* Localisation exacte (décision produit 2026-08-16) — alimente le
              bloc « Lieu & accès » de la page publique. Tout est optionnel :
              on ne bloque pas la création d'un événement pour une adresse pas
              encore arrêtée, elle se complète depuis le Builder. */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Nom du lieu (optionnel)</label>
            <Input
              placeholder="Palais des Sports de Treichville"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Adresse (optionnel)</label>
            <Input
              placeholder="Boulevard de Marseille"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ville (optionnel)</label>
            <Input placeholder="Abidjan" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Pays (optionnel)</label>
            <Input
              placeholder="Côte d'Ivoire"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Indications d&apos;accès (optionnel)
            </label>
            <textarea
              rows={2}
              placeholder="Entrée côté nord, parking gratuit en face."
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Numéro officiel (optionnel)
            </label>
            <Input
              placeholder="+22890123456"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          {/* Plafond réel : la somme des stocks de billets ne pourra pas le
              dépasser, refus côté serveur à la création d'un billet. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Personnes prévues (optionnel)
            </label>
            <Input
              type="number"
              min={1}
              placeholder="500"
              value={expectedAttendees}
              onChange={(e) => setExpectedAttendees(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Plafond : vous ne pourrez pas mettre en vente plus de places que ce nombre.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Description (optionnelle)</label>
            <textarea
              rows={3}
              placeholder="Décrivez votre événement en quelques lignes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={create.isPending} className="w-fit">
              {create.isPending ? 'Création...' : "Créer l'événement"}
            </Button>
            {/* Sortie de secours : sans elle, ouvrir la création par erreur
                enfermerait le manager sur ce formulaire. Absente au tout
                premier événement — il n'y a alors rien vers quoi revenir. */}
            {onAnnuler && (
              <Button type="button" variant="outline" onClick={onAnnuler} className="w-fit">
                Annuler
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
