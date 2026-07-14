'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LogIn, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPatch, apiPost, ApiError } from '@/lib/api';

/**
 * Page Admin — gestion des comptes Manager (CDC §14.3, décision produit
 * 2026-07-14) : invitation par email, suspension, statut d'abonnement manuel
 * (V1, pas de facturation récurrente réelle), et impersonation (accès direct
 * au dashboard Manager sans ses identifiants).
 */

interface ManagerRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isSelfService: boolean;
  subscriptionActive: boolean;
  createdAt: string;
  eventId: string | null;
  eventTitle: string | null;
  eventStatus: string | null;
}

const QUERY_KEY = ['admin-managers'];

export default function AdminManagersPage() {
  const queryClient = useQueryClient();
  const { data: managers, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api<ManagerRow[]>('/api/admin/managers'),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const invite = useMutation({
    mutationFn: () => apiPost<{ id: string; emailSent: boolean }>('/api/admin/managers', { name, email }),
    onSuccess: (data) => {
      toast.success(
        data.emailSent
          ? `Invitation envoyée à ${email}`
          : `Compte créé pour ${email}, mais l'email n'a pas pu être envoyé — relancez manuellement.`,
      );
      setName('');
      setEmail('');
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'inviter ce manager");
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/api/admin/managers/${id}/active`, { isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'Manager réactivé' : 'Manager suspendu');
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de changer le statut');
    },
  });

  const toggleSubscription = useMutation({
    mutationFn: ({ id, subscriptionActive }: { id: string; subscriptionActive: boolean }) =>
      apiPatch(`/api/admin/managers/${id}/subscription`, { subscriptionActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.subscriptionActive ? 'Abonnement activé' : 'Abonnement désactivé');
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible de changer l'abonnement");
    },
  });

  const impersonate = useMutation({
    mutationFn: (id: string) => apiPost(`/api/admin/managers/${id}/impersonate`, {}),
    onSuccess: () => {
      window.location.href = '/manager';
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de se connecter en tant que ce manager');
    },
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Managers</h1>
        <p className="text-sm text-muted-foreground">
          Inviter, suspendre, gérer l&apos;abonnement et accéder directement au dashboard d&apos;un manager.
        </p>
      </div>

      <Card className="p-4.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
          className="flex flex-col gap-2.5 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <Input required placeholder="Jean Dupont" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input
              required
              type="email"
              placeholder="manager@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={invite.isPending}>
            <UserPlus className="size-4" />
            {invite.isPending ? 'Envoi...' : 'Inviter par email'}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden py-0">
        <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">Comptes Manager</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        ) : isError || !managers ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Impossible de charger les managers.
          </div>
        ) : managers.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Aucun manager pour le moment.</div>
        ) : (
          managers.map((m, i) => (
            <div
              key={m.id}
              className={i < managers.length - 1 ? 'border-b border-border' : ''}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.eventTitle ?? 'Aucun événement'}
                    {m.isSelfService && ' · Inscription self-service'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={m.isActive ? 'success' : 'secondary'}>
                    {m.isActive ? 'Actif' : 'Suspendu'}
                  </Badge>
                  <Badge variant={m.subscriptionActive ? 'success' : 'outline'}>
                    {m.subscriptionActive ? 'Abonné' : 'Non abonné'}
                  </Badge>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate({ id: m.id, isActive: !m.isActive })}
                  >
                    {m.isActive ? 'Suspendre' : 'Réactiver'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={toggleSubscription.isPending}
                    onClick={() =>
                      toggleSubscription.mutate({ id: m.id, subscriptionActive: !m.subscriptionActive })
                    }
                  >
                    {m.subscriptionActive ? 'Couper abonnement' : 'Activer abonnement'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={impersonate.isPending}
                    onClick={() => impersonate.mutate(m.id)}
                  >
                    <LogIn className="size-3.5" />
                    Se connecter en tant que
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
