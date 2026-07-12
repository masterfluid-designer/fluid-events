'use client';

import { useQuery } from '@tanstack/react-query';
import { Ticket, Users, DollarSign, TrendingUp, Activity } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

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
  managers: Array<{
    name: string;
    email: string;
    isActive: boolean;
    eventTitle: string | null;
    eventStatus: string | null;
  }>;
  providers: Array<{ name: string; configured: boolean; isActive: boolean; isDefault: boolean }>;
  recentLogs: Array<{ action: string; createdAt: string }>;
}

export default function AdminOverviewPage() {
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
    { label: 'Managers', value: overview.managersCount.toString(), icon: <Users className="size-4" /> },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d&apos;ensemble plateforme</h1>
        <p className="text-sm text-muted-foreground">Indicateurs clés de la plateforme</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                <span className="text-accent-terracotta dark:text-accent-terracotta-dark">{kpi.icon}</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden py-0">
          <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
            <span className="text-sm font-bold">Managers</span>
          </div>
          {overview.managers.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Aucun manager pour le moment.</div>
          ) : (
            overview.managers.map((m, i) => (
              <div
                key={m.email}
                className={`flex items-center justify-between px-4.5 py-3 text-sm ${
                  i < overview.managers.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.eventTitle ?? 'Aucun événement'}</div>
                </div>
                <Badge variant={m.isActive ? 'success' : 'secondary'}>
                  {m.isActive ? 'Actif' : 'Suspendu'}
                </Badge>
              </div>
            ))
          )}
        </Card>

        <Card>
          <CardContent className="space-y-2.5 p-4.5">
            <div className="mb-1.5 text-sm font-bold">Fournisseurs de paiement</div>
            {overview.providers.map((p) => (
              <div
                key={p.name}
                className={`flex items-center justify-between rounded-lg border border-border px-3 py-2.5 ${
                  !p.configured ? 'opacity-55' : ''
                }`}
              >
                <span className="text-sm font-semibold capitalize">{p.name.toLowerCase()}</span>
                <Badge variant={p.isDefault ? 'success' : p.isActive ? 'secondary' : 'outline'}>
                  {p.isDefault ? 'Par défaut' : p.isActive ? 'Actif' : p.configured ? 'Inactif' : 'Non configuré'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
