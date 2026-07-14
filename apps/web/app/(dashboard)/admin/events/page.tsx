'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Page Admin — vue plateforme de tous les événements (décision produit
 * 2026-07-14). Lecture seule : la gestion d'un événement reste au Manager
 * propriétaire (1 Manager = 1 Event, V1).
 */

interface PlatformEvent {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  managerName: string;
  managerEmail: string;
  revenue: number;
  ticketsSold: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PUBLISHED: 'Publié',
  CANCELLED: 'Annulé',
  EXPIRED: 'Expiré',
};

const STATUS_VARIANTS: Record<string, 'success' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  PUBLISHED: 'success',
  CANCELLED: 'destructive',
  EXPIRED: 'outline',
};

export default function AdminEventsPage() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => api<PlatformEvent[]>('/api/admin/events'),
  });

  const currencyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' });
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Événements</h1>
        <p className="text-sm text-muted-foreground">
          Vue plateforme de tous les événements, tous managers confondus.
        </p>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">
            {events ? `${events.length} événement${events.length > 1 ? 's' : ''}` : 'Événements'}
          </span>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        ) : isError || !events ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Impossible de charger les événements.
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Aucun événement pour le moment.</div>
        ) : (
          events.map((e, i) => (
            <div key={e.id} className={i < events.length - 1 ? 'border-b border-border' : ''}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.managerName} · {e.managerEmail}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dateFmt.format(new Date(e.startDate))} → {dateFmt.format(new Date(e.endDate))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[e.status] ?? 'outline'}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </Badge>
                  <Badge variant="outline">{e.ticketsSold} billet{e.ticketsSold > 1 ? 's' : ''}</Badge>
                  <Badge variant="outline">{currencyFmt.format(e.revenue)}</Badge>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
