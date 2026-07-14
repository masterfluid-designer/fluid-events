'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPatch, ApiError } from '@/lib/api';

/**
 * Page Admin — vue plateforme de tous les événements (décision produit
 * 2026-07-14). L'Admin peut annuler/republier n'importe quel événement
 * (`PATCH /api/admin/events/:eventId/status`, sans vérification d'ownership,
 * contrairement à l'action équivalente côté Manager qui reste bornée à son
 * propre événement) — même sémantique "annulation douce" que côté Manager :
 * les billets déjà vendus restent valides en base, aucun remboursement
 * automatique (BUSINESS.md §12).
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
  const queryClient = useQueryClient();
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => api<PlatformEvent[]>('/api/admin/events'),
  });

  const setStatus = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: 'PUBLISHED' | 'CANCELLED' }) =>
      apiPatch(`/api/admin/events/${eventId}/status`, { status }),
    onSuccess: (_data, variables) => {
      toast.success(variables.status === 'CANCELLED' ? 'Événement annulé' : 'Événement republié');
      setConfirmingCancelId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de changer le statut de l'événement");
    },
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

                  {e.status === 'PUBLISHED' && confirmingCancelId !== e.id && (
                    <Button variant="outline" size="sm" onClick={() => setConfirmingCancelId(e.id)}>
                      Annuler
                    </Button>
                  )}
                  {e.status === 'PUBLISHED' && confirmingCancelId === e.id && (
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                      <span className="text-xs text-muted-foreground">
                        Billets déjà vendus valides, sans remboursement auto. Confirmer ?
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ eventId: e.id, status: 'CANCELLED' })}
                      >
                        {setStatus.isPending ? 'Annulation...' : 'Confirmer'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmingCancelId(null)}>
                        Retour
                      </Button>
                    </div>
                  )}
                  {e.status === 'CANCELLED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ eventId: e.id, status: 'PUBLISHED' })}
                    >
                      Republier
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
