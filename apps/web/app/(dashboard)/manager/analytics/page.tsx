'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Ticket, ScanLine, Radio, Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { SalesTrendChart, type DailySalesPoint } from '@/components/ui/sales-trend-chart';
import { api, ApiError } from '@/lib/api';

/**
 * Page Manager — Statistiques (décision produit 2026-07-14). Vue analytics
 * dédiée, distincte du dashboard opérationnel (`/manager`, qui garde le
 * statut de l'événement et l'action d'annulation) — réutilise la même
 * source de données (`GET /api/events/mine/overview`), React Query dédoublonne
 * automatiquement l'appel si les deux pages sont visitées dans la session.
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
}

export default function ManagerAnalyticsPage() {
  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['manager-overview'],
    queryFn: () => api<Overview>('/api/events/mine/overview'),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError && error instanceof ApiError && error.code === 'EVENT_NOT_FOUND') {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
          Aucune statistique disponible — vous n&apos;avez pas encore d&apos;événement.{' '}
          <Link href="/manager" className="font-semibold text-primary underline">
            Créez votre premier événement
          </Link>
          .
        </div>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="p-4 sm:p-6 text-sm text-muted-foreground">
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
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistiques</h1>
        <p className="text-sm text-muted-foreground">{overview.event.title}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-sm">
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
        <CardContent className="overflow-x-auto">
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
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-sm">
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
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
