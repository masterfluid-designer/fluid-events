import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/**
 * Participants (CDC §6.9 /api/participants — export CSV/PDF).
 * Données mockées — pas encore d'API `participants` branchée.
 */

interface Participant {
  name: string;
  email: string;
  ticket: string;
  order: string;
  purchasedAt: string;
  status: 'scanned' | 'pending';
}

const participants: Participant[] = [
  { name: 'Aïcha Koné', email: 'a***@gmail.com', ticket: 'VIP Or', order: 'ORD-3f8a1b', purchasedAt: '12 juin', status: 'scanned' },
  { name: 'Yao Kouassi', email: 'y***@gmail.com', ticket: 'Standard', order: 'ORD-7c2e9d', purchasedAt: '15 juin', status: 'pending' },
  { name: 'Fatou Diallo', email: 'f***@gmail.com', ticket: 'VIP Or', order: 'ORD-9a12ff', purchasedAt: '18 juin', status: 'pending' },
];

export default function ParticipantsPage() {
  const scannedCount = participants.filter((p) => p.status === 'scanned').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
          <p className="text-sm text-muted-foreground">
            {participants.length} billets · {scannedCount} scannés
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Exporter CSV</Button>
          <Button variant="outline">Exporter PDF</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <div className="flex flex-1 min-w-50 items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm text-muted-foreground">
          <Search className="size-3.5" />
          Rechercher un participant…
        </div>
        <div className="rounded-lg border border-border px-3.5 py-2.5 text-sm">Tous les billets ▾</div>
        <div className="rounded-lg border border-border px-3.5 py-2.5 text-sm">Statut ▾</div>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-border bg-secondary px-4.5 py-3 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
          <span>Participant</span>
          <span>Billet</span>
          <span>Commande</span>
          <span>Achat</span>
          <span>Statut</span>
        </div>
        {participants.map((p, i) => (
          <div
            key={p.order}
            className={`grid grid-cols-[1.6fr_1fr_1fr_1fr_0.8fr] items-center gap-4 px-4.5 py-3.5 text-sm ${
              i < participants.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.email}</div>
            </div>
            <span>{p.ticket}</span>
            <span className="font-mono text-xs text-muted-foreground">{p.order}</span>
            <span className="text-muted-foreground">{p.purchasedAt}</span>
            <Badge variant={p.status === 'scanned' ? 'success' : 'secondary'} className="w-fit">
              {p.status === 'scanned' ? 'Scanné' : 'En attente'}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}
