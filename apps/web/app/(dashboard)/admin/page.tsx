'use client';

import { StatGrid } from '@/components/dashboard/stat-grid';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, UserCheck, Ticket, Users, DollarSign, TrendingUp, Activity, Settings2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SalesTrendChart, type DailySalesPoint } from '@/components/ui/sales-trend-chart';
import { api } from '@/lib/api';
import { PaymentConfigPanel } from './payment-config-panel';

/**
 * Dashboard Super Admin (CDC §14.2 — KPIs plateforme).
 * Données réelles via GET /api/admin/overview (agrégées à la volée).
 */

interface Overview {
  activeEvents: number;
  managersCount: number;
  revenue30d: number;
  currency: string;
  ticketsSold: number;
  salesOverTime: DailySalesPoint[];
  /** Répartition des événements par régime d'accès (2026-08-22). */
  parRegime: Record<string, number>;
  inscriptionsTotales: number;
  /** Événements publiés qui vendent sans pouvoir encaisser. */
  evenementsSansPaiement: number;
  commandesEchouees30j: number;
  managers: Array<{
    name: string;
    email: string;
    isActive: boolean;
    eventId: string | null;
    eventTitle: string | null;
    eventStatus: string | null;
    eventAccessMode: string | null;
    paymentProvider: string | null;
  }>;
  recentLogs: Array<{ action: string; createdAt: string }>;
}

export default function AdminOverviewPage() {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/api/admin/overview'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger les statistiques plateforme.
      </div>
    );
  }

  const currencyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: overview.currency });

  const kpis = [
    { label: 'Événements publiés', value: overview.activeEvents.toString(), icon: <Ticket className="size-4" /> },
    { label: 'Revenus (30j)', value: currencyFmt.format(overview.revenue30d), icon: <DollarSign className="size-4" /> },
    { label: 'Billets vendus', value: overview.ticketsSold.toLocaleString('fr-FR'), icon: <TrendingUp className="size-4" /> },
    {
      label: 'Inscrits',
      value: overview.inscriptionsTotales.toLocaleString('fr-FR'),
      icon: <UserCheck className="size-4" />,
    },
    { label: 'Managers', value: overview.managersCount.toString(), icon: <Users className="size-4" /> },
  ];

  const REGIMES: Array<[string, string]> = [
    ['TICKETED_ACCOUNT', 'Billetterie · compte'],
    ['TICKETED_GUEST', 'Billetterie · sans compte'],
    ['RSVP', 'Inscription simple'],
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble plateforme</h1>
        <p className="text-sm text-muted-foreground">Indicateurs clés de la plateforme</p>
      </div>

      {/*
        Ce que l'Admin devait deviner jusqu'ici. Ces deux alertes sont
        remontées AVANT les chiffres : un événement qui vend sans pouvoir
        encaisser perd de l’argent à chaque visiteur, et une série d’échecs
        de paiement signale une configuration cassée bien avant qu’un
        organisateur ne s’en plaigne.
      */}
      {overview.evenementsSansPaiement > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>
              {overview.evenementsSansPaiement} événement
              {overview.evenementsSansPaiement > 1 ? 's' : ''} publié
              {overview.evenementsSansPaiement > 1 ? 's' : ''}
            </strong>{' '}
            vend{overview.evenementsSansPaiement > 1 ? 'ent' : ''} des billets sans aucun
            fournisseur de paiement actif —{' '}
            {overview.evenementsSansPaiement > 1 ? 'leurs visiteurs' : 'ses visiteurs'} ne peuvent
            rien acheter.
          </span>
        </div>
      )}

      {overview.commandesEchouees30j > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{overview.commandesEchouees30j}</strong> paiement
            {overview.commandesEchouees30j > 1 ? 's ont' : ' a'} échoué sur les 30 derniers jours.
          </span>
        </div>
      )}

      <StatGrid stats={kpis} />

      <Card className="overflow-hidden py-0">
        <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">Événements par régime d’accès</span>
        </div>
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {REGIMES.map(([cle, libelle]) => (
            <div key={cle} className="px-4.5 py-4">
              <div className="text-2xl font-bold tabular-nums">{overview.parRegime[cle] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{libelle}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden py-0">
        <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">Managers &amp; paiement par événement</span>
        </div>
        {overview.managers.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Aucun manager pour le moment.</div>
        ) : (
          overview.managers.map((m, i) => (
            <div key={m.email} className={i < overview.managers.length - 1 ? 'border-b border-border' : ''}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.eventTitle ?? 'Aucun événement'}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={m.isActive ? 'success' : 'secondary'}>
                    {m.isActive ? 'Actif' : 'Suspendu'}
                  </Badge>
                  <Badge variant={m.paymentProvider ? 'success' : 'outline'}>
                    {m.paymentProvider ? `Paiement : ${m.paymentProvider}` : 'Paiement non configuré'}
                  </Badge>
                  {m.eventId && (
                    <Button
                      variant="outline"
                      size="icon"
                      title="Configurer le paiement"
                      aria-label="Configurer le paiement"
                      onClick={() => setExpandedEventId(expandedEventId === m.eventId ? null : m.eventId)}
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {m.eventId && expandedEventId === m.eventId && <PaymentConfigPanel eventId={m.eventId} />}
            </div>
          ))
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes dans le temps</CardTitle>
          <CardDescription>Revenus confirmés par jour, toute la plateforme, 30 derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesTrendChart data={overview.salesOverTime} currency={overview.currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> Logs système
          </CardTitle>
          <CardDescription>Derniers événements système</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {overview.recentLogs.length === 0 ? (
            <p className="text-muted-foreground">Aucun événement enregistré.</p>
          ) : (
            overview.recentLogs.map((log, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <code className="text-accent-terracotta dark:text-accent-terracotta-dark font-mono text-xs">
                  {log.action}
                </code>
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(log.createdAt),
                  )}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
