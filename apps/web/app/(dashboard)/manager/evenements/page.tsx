'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  MapPin,
  Ticket,
  Users,
  AlertTriangle,
  ExternalLink,
  Search,
  LayoutDashboard,
  Pencil,
} from 'lucide-react';
import { EventAccessMode } from '@saas-events/types';
import { api } from '@/lib/api';
import { lienDashboard } from '@/lib/evenement-actif';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Liste des événements du manager (2026-08-23).
 *
 * Cette page n'existait pas. Un manager Premium portant huit événements ne
 * pouvait en changer que par un sélecteur dans la barre latérale, sans jamais
 * voir les huit côte à côte — impossible de savoir lequel vend, lequel dort en
 * brouillon, lequel n'a pas de moyen de paiement.
 *
 * C'est le point d'entrée naturel du tableau de bord dès qu'il y a plus d'un
 * événement : on choisit ici, on travaille ailleurs.
 */
interface EvenementListe {
  id: string;
  slug: string;
  title: string;
  status: string;
  accessMode: EventAccessMode;
  startDate: string;
  endDate: string;
  venueName: string | null;
  city: string | null;
  coverImageUrl: string | null;
  typesDeBillets: number;
  journees: number;
  billetsVendus: number;
  inscriptions: number;
  paiementActif: string | null;
}

const STATUTS: Record<string, { libelle: string; variante: 'success' | 'secondary' | 'destructive' }> =
  {
    PUBLISHED: { libelle: 'Publié', variante: 'success' },
    DRAFT: { libelle: 'Brouillon', variante: 'secondary' },
    CANCELLED: { libelle: 'Annulé', variante: 'destructive' },
    EXPIRED: { libelle: 'Terminé', variante: 'secondary' },
  };

const REGIMES: Record<string, string> = {
  TICKETED_ACCOUNT: 'Billetterie · compte requis',
  TICKETED_GUEST: 'Billetterie · sans compte',
  RSVP: 'Inscription simple',
};

function formaterPeriode(debut: string, fin: string): string {
  const d = new Date(debut);
  const f = new Date(fin);
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  // Un événement d'un seul jour n'a pas à s'annoncer comme une période.
  return d.toDateString() === f.toDateString()
    ? jour.format(d)
    : `${jour.format(d)} → ${jour.format(f)}`;
}

export default function PageEvenements() {
  const [recherche, setRecherche] = useState('');

  const { data: evenements, isLoading, isError } = useQuery({
    queryKey: ['mes-evenements'],
    queryFn: () => api<EvenementListe[]>('/api/events/mine/list'),
  });

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ plan?: 'FREE' | 'PREMIUM' }>('/api/auth/me'),
  });

  const maximum = me?.plan === 'PREMIUM' ? 8 : 1;

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q || !evenements) return evenements ?? [];
    return evenements.filter((e) =>
      [e.title, e.venueName ?? '', e.city ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [evenements, recherche]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !evenements) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger vos événements. Rechargez la page.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes événements</h1>
          <p className="text-sm text-muted-foreground">
            {evenements.length} sur {maximum} autorisé{maximum > 1 ? 's' : ''} par votre palier
            {me?.plan !== 'PREMIUM' && evenements.length >= maximum && (
              <> — le palier Premium en autorise huit.</>
            )}
          </p>
        </div>
      </div>

      {evenements.length > 4 && (
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un événement…"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}

      {filtres.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CalendarDays className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {evenements.length === 0
              ? 'Vous n’avez pas encore d’événement. Créez-en un depuis le tableau de bord.'
              : 'Aucun événement ne correspond à cette recherche.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtres.map((e) => {
            const statut = STATUTS[e.status] ?? { libelle: e.status, variante: 'secondary' as const };
            const surInscription = e.accessMode === EventAccessMode.RSVP;
            const lieu = [e.venueName, e.city].filter(Boolean).join(', ');

            /*
             * Un événement publié qui vend sans moyen de paiement actif ne peut
             * rien encaisser. C'est le défaut le plus coûteux, et il n'était
             * visible nulle part côté organisateur.
             */
            const vendSansPouvoirEncaisser =
              !surInscription && e.status === 'PUBLISHED' && !e.paiementActif;

            return (
              <Card key={e.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{e.title}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="size-3.5 shrink-0" />
                      {formaterPeriode(e.startDate, e.endDate)}
                      {e.journees > 0 && <span>· {e.journees} journées</span>}
                    </p>
                    {lieu && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        {lieu}
                      </p>
                    )}
                  </div>
                  <Badge variant={statut.variante}>● {statut.libelle}</Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <Badge variant="secondary">{REGIMES[e.accessMode] ?? e.accessMode}</Badge>

                  {/* Les chiffres qui comptent dépendent du régime : un
                      événement sur inscription n'a ni billet ni recette. */}
                  {surInscription ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="size-3.5" />
                      <strong className="text-foreground tabular-nums">{e.inscriptions}</strong>{' '}
                      inscrit{e.inscriptions > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Ticket className="size-3.5" />
                      <strong className="text-foreground tabular-nums">{e.billetsVendus}</strong>{' '}
                      billet{e.billetsVendus > 1 ? 's' : ''} vendu{e.billetsVendus > 1 ? 's' : ''}
                      {e.typesDeBillets > 0 && (
                        <span className="text-muted-foreground">
                          · {e.typesDeBillets} tarif{e.typesDeBillets > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {vendSansPouvoirEncaisser && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Aucun moyen de paiement actif — vos visiteurs ne peuvent rien acheter.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {/* L'action principale mène au tableau de bord DE CET
                      événement : c'est le geste attendu neuf fois sur dix. */}
                  <Button asChild size="sm">
                    <Link href={lienDashboard('/manager', e.id)}>
                      <LayoutDashboard className="size-3.5" />
                      Tableau de bord
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={lienDashboard('/manager/builder', e.id)}>
                      <Pencil className="size-3.5" />
                      Modifier
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/e/${e.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      Page publique
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
