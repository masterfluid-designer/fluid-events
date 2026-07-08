'use client';

import { Calendar, MapPin, Download, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Dashboard Client — Mes billets (CDC §6.10 GET /api/client/tickets).
 * Chaque billet = 1 QR + 1 PDF téléchargeable. La récupération du QR
 * vérifie l'ownership côté backend (clientId === jwt.sub).
 */
interface ClientTicket {
  id: string;
  eventName: string;
  ticketName: string;
  orderNumber: string;
  startDate: string;
  location: string;
  qrCodeUrl: string | null;
  isScanned: boolean;
}

// Données de démo — en prod via React Query sur /api/client/tickets
const mockTickets: ClientTicket[] = [
  {
    id: '1',
    eventName: 'Concert FESTA 2026',
    ticketName: 'VIP Or',
    orderNumber: 'ORD-3f8a1b',
    startDate: '2026-12-31T20:00:00Z',
    location: 'Palais des Sports, Abidjan',
    qrCodeUrl: null,
    isScanned: false,
  },
  {
    id: '2',
    eventName: 'Conférence Tech Africa',
    ticketName: 'Standard',
    orderNumber: 'ORD-7c2e9d',
    startDate: '2026-11-15T09:00:00Z',
    location: 'Hôtel Ivoire, Abidjan',
    qrCodeUrl: null,
    isScanned: true,
  },
];

export default function ClientTicketsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes billets</h1>
        <p className="text-sm text-muted-foreground">
          Présentez le QR à l&apos;entrée pour accéder à vos événements
        </p>
      </div>

      {mockTickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <QrCode className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Aucun billet pour le moment</p>
            <Button asChild>
              <a href="/">Découvrir des événements</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mockTickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: ClientTicket }) {
  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ticket.startDate));

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        {/* Section visuelle */}
        <div className="flex w-28 shrink-0 items-center justify-center bg-primary/10">
          <QrCode className="size-12 text-primary/70" />
        </div>
        {/* Infos */}
        <div className="flex-1 p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold leading-tight">{ticket.eventName}</h3>
              <p className="text-sm text-primary">{ticket.ticketName}</p>
            </div>
            {ticket.isScanned ? (
              <Badge variant="success">✓ Utilisé</Badge>
            ) : (
              <Badge variant="secondary">Valide</Badge>
            )}
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3" /> {formattedDate}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="size-3" /> {ticket.location}
            </div>
            <div className="font-mono">Réf : {ticket.orderNumber}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline">
              <QrCode className="size-3.5" /> Voir QR
            </Button>
            <Button size="sm" variant="ghost">
              <Download className="size-3.5" /> PDF
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
