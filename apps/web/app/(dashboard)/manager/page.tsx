'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DollarSign, Ticket, ScanLine, Radio, Clock, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SalesTrendChart, type DailySalesPoint } from '@/components/ui/sales-trend-chart';
import { api, apiPatch, ApiError } from '@/lib/api';

/**
 * Dashboard Manager (CDC §14.3 — KPIs événement géré).
 * En V1, 1 Manager = 1 Événement (CDC §1.4). Données réelles via
 * GET /api/events/mine/overview (agrégées à la volée depuis Order/OrderItem/ScannerLog).
 */

interface Overview {
  event: { id: string; title: string; slug: string; status: string };
  totalRevenue: number;
  currency: string;
  ticketsSold: number;
  revenueByTicketType: Array<{ name: string; revenue: number; count: number }>;
  salesOverTime: DailySalesPoint[];
  fillRateByTicketType: Array<{ name: string; stock: number; stockSold: number; fillRate: number }>;
  scansByScanner: Array<{ name: string; scans: number; lastScanAt: string | null }>;
  paymentStatus: { configured: boolean; provider: string | null };
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
};

export default function ManagerDashboardPage() {
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['manager-overview'],
    queryFn: () => api<Overview>('/api/events/mine/overview'),
  });

  const setStatus = useMutation({
    mutationFn: (status: 'PUBLISHED' | 'CANCELLED') => apiPatch('/api/events/mine', { status }),
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

  const stats = [
    { label: 'Revenus', value: currencyFmt.format(overview.totalRevenue), icon: <DollarSign className="size-4" /> },
    { label: 'Billets vendus', value: overview.ticketsSold.toLocaleString('fr-FR'), icon: <Ticket className="size-4" /> },
    { label: 'Taux de scan', value: `${scanRate}%`, icon: <ScanLine className="size-4" /> },
    { label: 'Scanners actifs', value: overview.scansByScanner.length.toString(), icon: <Radio className="size-4" /> },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{overview.event.title}</h1>
          <p className="text-sm text-muted-foreground">Tableau de bord de votre événement</p>
        </div>
        <div className="flex items-center gap-3">
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
          {overview.event.status === 'PUBLISHED' && !confirmingCancel && (
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(true)}>
              Annuler l&apos;événement
            </Button>
          )}
          {overview.event.status === 'PUBLISHED' && confirmingCancel && (
            <div className="flex items-center gap-2">
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
        </div>
      </div>

      {overview.paymentStatus.configured ? (
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
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className="text-accent-terracotta dark:text-accent-terracotta-dark">{s.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> Activité scanners
          </CardTitle>
          <CardDescription>Scans valides par point d&apos;accès</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
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
