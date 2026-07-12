'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPost, ApiError } from '@/lib/api';

/**
 * Gestion des billets (CDC §6.3). Données réelles via GET /api/events/mine
 * (inclut les tickets) et POST /api/events/:eventId/tickets pour la création.
 */

interface TicketRow {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  stock: number;
  stockSold: number;
  isActive: boolean;
}

interface EventWithTickets {
  id: string;
  tickets: TicketRow[];
}

export default function ManagerTicketsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['manager-event'],
    queryFn: () => api<EventWithTickets>('/api/events/mine'),
  });

  const createTicket = useMutation({
    mutationFn: () =>
      apiPost(`/api/events/${event!.id}/tickets`, {
        name,
        price: Number(price),
        stock: Number(stock),
        description: description || undefined,
      }),
    onSuccess: () => {
      toast.success('Billet créé');
      setShowForm(false);
      setName('');
      setPrice('');
      setStock('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de créer le billet');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Impossible de charger vos billets.
      </div>
    );
  }

  const totalSold = event.tickets.reduce((sum, t) => sum + t.stockSold, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Types de billets</h1>
          <p className="text-sm text-muted-foreground">
            {event.tickets.length} type{event.tickets.length > 1 ? 's' : ''} · {totalSold.toLocaleString('fr-FR')} vendus
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? 'Annuler' : 'Ajouter un billet'}
        </Button>
      </div>

      {showForm && (
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTicket.mutate();
            }}
            className="grid gap-3 md:grid-cols-4"
          >
            <input
              required
              placeholder="Nom (ex: VIP)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Prix (XOF)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              min="0"
              placeholder="Stock"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={createTicket.isPending} className="md:col-span-4 w-fit">
              {createTicket.isPending ? 'Création...' : 'Créer le billet'}
            </Button>
          </form>
        </Card>
      )}

      {event.tickets.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Aucun type de billet pour le moment.
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="grid grid-cols-[1.6fr_0.9fr_1.3fr_0.8fr] gap-4 border-b border-border bg-secondary px-4.5 py-3 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
            <span>Billet</span>
            <span>Prix</span>
            <span>Stock</span>
            <span>Statut</span>
          </div>
          {event.tickets.map((t, i) => {
            const percent = t.stock > 0 ? Math.round((t.stockSold / t.stock) * 100) : 0;
            const soldOut = t.stockSold >= t.stock;
            return (
              <div
                key={t.id}
                className={`grid grid-cols-[1.6fr_0.9fr_1.3fr_0.8fr] items-center gap-4 px-4.5 py-3.5 ${
                  i < event.tickets.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                </div>
                <div className="text-sm font-semibold">
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: t.currency }).format(Number(t.price))}
                </div>
                <div>
                  <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${soldOut ? 'bg-muted-foreground' : 'bg-primary'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.stockSold} / {t.stock} vendus
                  </div>
                </div>
                <Badge variant={!t.isActive ? 'outline' : soldOut ? 'secondary' : 'success'} className="w-fit">
                  {!t.isActive ? 'Inactif' : soldOut ? 'Épuisé' : 'Actif'}
                </Badge>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
