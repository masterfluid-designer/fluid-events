'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Client — Mes commandes (vue par commande, distincte de "Mes billets" qui
 * aplatit par billet individuel). Réutilise le même endpoint
 * `GET /api/payments/orders` (aucun changement backend nécessaire) — React
 * Query dédoublonne l'appel si les deux pages sont visitées dans la session.
 */

type OrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

interface ClientOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  paidAt: string | null;
  event: { slug: string; title: string; startDate: string; location: string | null };
  items: Array<{ id: string; ticketName: string; hasTicket: boolean; isScanned: boolean }>;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente de paiement',
  PAID: 'Payée',
  FAILED: 'Paiement échoué',
  REFUNDED: 'Remboursée',
  CANCELLED: 'Annulée',
};

const STATUS_VARIANTS: Record<OrderStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'secondary'> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'secondary',
  CANCELLED: 'outline',
};

export default function ClientOrdersPage() {
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['client-orders', null],
    queryFn: () => api<ClientOrder[]>('/api/payments/orders'),
  });

  const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes commandes</h1>
        <p className="text-sm text-muted-foreground">Historique de vos achats, tous événements confondus.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-6" />
        </div>
      ) : isError || !orders ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Impossible de charger vos commandes pour le moment.
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-muted-foreground">Aucune commande pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {orders.map((o, i) => (
            <div key={o.id} className={i < orders.length - 1 ? 'border-b border-border' : ''}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3.5 text-sm">
                <div>
                  <div className="font-semibold">{o.event.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{o.orderNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.paidAt ? dateFmt.format(new Date(o.paidAt)) : 'Non payée'} ·{' '}
                    {o.items.length} billet{o.items.length > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: o.currency }).format(
                      o.totalAmount,
                    )}
                  </span>
                  <Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  {o.status === 'PAID' && (
                    <Link
                      href={`/client?event=${o.event.slug}`}
                      className="text-xs font-semibold text-primary underline"
                    >
                      Voir mes billets
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
