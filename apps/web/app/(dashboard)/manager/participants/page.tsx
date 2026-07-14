'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Participants (CDC §6.9). Données réelles via GET /api/events/:eventId/participants
 * (billets payés uniquement — une commande PENDING/FAILED n'a pas de participant).
 */

interface Participant {
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  ticketName: string;
  purchasedAt: string | null;
  isScanned: boolean;
}

export default function ParticipantsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scanned' | 'pending'>('all');

  const { data: event } = useQuery({
    queryKey: ['manager-event'],
    queryFn: () => api<{ id: string }>('/api/events/mine'),
  });

  const { data: participants, isLoading, isError } = useQuery({
    queryKey: ['manager-participants', event?.id],
    queryFn: () => api<Participant[]>(`/api/events/${event!.id}/participants`),
    enabled: Boolean(event?.id),
  });

  const filtered = useMemo(() => {
    if (!participants) return [];
    return participants.filter((p) => {
      const matchesSearch =
        !search ||
        p.clientName.toLowerCase().includes(search.toLowerCase()) ||
        p.clientEmail.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'scanned' ? p.isScanned : !p.isScanned);
      return matchesSearch && matchesStatus;
    });
  }, [participants, search, statusFilter]);

  function exportCsv() {
    if (!participants || participants.length === 0) return;
    const header = ['Nom', 'Email', 'Billet', 'Commande', 'Achat', 'Statut'];
    const rows = participants.map((p) => [
      p.clientName,
      p.clientEmail,
      p.ticketName,
      p.orderNumber,
      p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString('fr-FR') : '',
      p.isScanned ? 'Scanné' : 'En attente',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'participants.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !participants) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger les participants.
      </div>
    );
  }

  const scannedCount = participants.filter((p) => p.isScanned).length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
          <p className="text-sm text-muted-foreground">
            {participants.length} billet{participants.length > 1 ? 's' : ''} · {scannedCount} scanné{scannedCount > 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={participants.length === 0}>
          Exporter CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <div className="flex flex-1 min-w-50 items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un participant…"
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-border px-3.5 py-2.5 text-sm"
        >
          <option value="all">Tous les statuts</option>
          <option value="scanned">Scanné</option>
          <option value="pending">En attente</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Aucun participant {search || statusFilter !== 'all' ? 'ne correspond à ces filtres' : 'pour le moment'}.
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="border-b border-border px-4.5 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {filtered.length} participant{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
          {filtered.map((p, i) => (
            <div
              key={`${p.orderNumber}-${i}`}
              className={`flex flex-wrap items-center justify-between gap-3 px-4.5 py-3.5 text-sm ${
                i < filtered.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div>
                <div className="font-semibold">{p.clientName}</div>
                <div className="text-xs text-muted-foreground">{p.clientEmail}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{p.ticketName}</Badge>
                <span className="font-mono">{p.orderNumber}</span>
                <span>{p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString('fr-FR') : '—'}</span>
                <Badge variant={p.isScanned ? 'success' : 'secondary'}>
                  {p.isScanned ? 'Scanné' : 'En attente'}
                </Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
