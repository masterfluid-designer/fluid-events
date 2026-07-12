'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Calendar, MapPin, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

/**
 * Dashboard Client — Mes billets (GET /api/payments/orders).
 * Chaque billet = 1 QR (généré après confirmation webhook). L'ownership est
 * vérifiée côté backend (clientId === jwt.sub) — jamais côté frontend.
 */

type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

interface ClientOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  paidAt: string | null;
  event: { title: string; startDate: string; location: string | null };
  items: Array<{ id: string; ticketName: string; hasTicket: boolean; isScanned: boolean }>;
}

async function fetchOrders(): Promise<ClientOrder[]> {
  return api<ClientOrder[]>('/api/payments/orders');
}

export default function ClientTicketsPage() {
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['client-orders'],
    queryFn: fetchOrders,
  });
  const [qrModalItemId, setQrModalItemId] = useState<{ orderId: string; itemId: string } | null>(null);

  const tickets = (orders ?? []).flatMap((order) =>
    order.items.map((item) => ({ order, item })),
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes billets</h1>
        <p className="text-sm text-muted-foreground">
          Présentez le QR à l&apos;entrée pour accéder à vos événements
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-6" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-muted-foreground">
              Impossible de charger vos billets pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
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
          {tickets.map(({ order, item }) => (
            <TicketCard
              key={item.id}
              order={order}
              item={item}
              onViewQr={() => setQrModalItemId({ orderId: order.id, itemId: item.id })}
            />
          ))}
        </div>
      )}

      {qrModalItemId && (
        <QrModal
          orderId={qrModalItemId.orderId}
          itemId={qrModalItemId.itemId}
          onClose={() => setQrModalItemId(null)}
        />
      )}
    </div>
  );
}

function statusBadge(order: ClientOrder, item: ClientOrder['items'][number]) {
  if (order.status === 'PAID' && item.isScanned) {
    return <Badge variant="success">✓ Utilisé</Badge>;
  }
  if (order.status === 'PAID' && item.hasTicket) {
    return <Badge variant="secondary">Valide</Badge>;
  }
  if (order.status === 'PENDING') {
    return <Badge variant="warning">En attente de paiement</Badge>;
  }
  if (order.status === 'FAILED') {
    return <Badge variant="destructive">Paiement échoué</Badge>;
  }
  return <Badge variant="outline">{order.status}</Badge>;
}

function TicketCard({
  order,
  item,
  onViewQr,
}: {
  order: ClientOrder;
  item: ClientOrder['items'][number];
  onViewQr: () => void;
}) {
  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(order.event.startDate));

  const usable = order.status === 'PAID' && item.hasTicket && !item.isScanned;

  return (
    <Card
      className={`overflow-hidden py-0 ${item.isScanned || order.status !== 'PAID' ? 'opacity-75' : 'border-black dark:border-white'}`}
    >
      <div className="flex">
        <div
          className={`flex w-24 shrink-0 items-center justify-center ${
            usable ? 'bg-primary' : 'bg-secondary'
          }`}
        >
          <QrCode
            className={`size-8 ${
              usable ? 'text-primary-foreground' : 'text-muted-foreground opacity-40'
            }`}
          />
        </div>
        <div className="flex-1 p-4.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold leading-tight">{order.event.title}</h3>
              <p className="text-accent-terracotta dark:text-accent-terracotta-dark text-sm font-semibold">
                {item.ticketName}
              </p>
            </div>
            {statusBadge(order, item)}
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3" /> {formattedDate}
            </div>
            {order.event.location && (
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3" /> {order.event.location}
              </div>
            )}
            <div className="font-mono">Réf : {order.orderNumber}</div>
          </div>
          {usable && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={onViewQr}>
                <QrCode className="size-3.5" /> Voir QR
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Récupère le token QR signé (détail commande) et le rend en image côté client. */
function QrModal({
  orderId,
  itemId,
  onClose,
}: {
  orderId: string;
  itemId: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => api<{ items: Array<{ id: string; qrCode: string | null }> }>(`/api/payments/orders/${orderId}`),
  });

  const qrToken = data?.items.find((i) => i.id === itemId)?.qrCode ?? null;
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;
    QRCode.toDataURL(qrToken, { width: 280, margin: 1 }).then((url) => {
      if (!cancelled) setQrImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xs rounded-2xl border border-stroke bg-white p-6 text-center shadow-solid-2 dark:border-strokedark dark:bg-blacksection">
        <button
          onClick={onClose}
          aria-label="fermer"
          className="float-right text-muted-foreground hover:text-black dark:hover:text-white"
        >
          <X className="size-4" />
        </button>
        <h2 className="mb-4 mt-1 font-serif text-lg">Votre QR d&apos;entrée</h2>
        {isLoading || !qrImage ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Impossible de charger le QR.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrImage} alt="QR code du billet" className="mx-auto size-70" />
        )}
        <p className="mt-4 text-xs text-manatee dark:text-waterloo">
          Présentez ce QR à l&apos;entrée. Il n&apos;est valable qu&apos;une seule fois.
        </p>
      </div>
    </div>
  );
}
