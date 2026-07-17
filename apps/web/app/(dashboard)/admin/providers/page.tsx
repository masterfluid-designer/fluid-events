'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { PaymentConfigPanel } from '../payment-config-panel';

/**
 * Page Admin — Paiements. Configuration des identifiants de paiement PAR
 * ÉVÉNEMENT, tous managers confondus (refonte 2026-07-17 — l'utilisateur ne
 * retrouvait pas où configurer les clés : cette page n'affichait auparavant
 * qu'un résumé lecture seule des configs DÉJÀ existantes, la vraie
 * configuration n'étant accessible que via une icône sans libellé sur
 * "Vue d'ensemble". Cette page est désormais le vrai point d'entrée —
 * réutilise le même `PaymentConfigPanel` que Vue d'ensemble, event par event).
 */

type Provider = 'KKIAPAY' | 'CINETPAY' | 'FEDAPAY';

const PROVIDER_LABELS: Record<Provider, string> = {
  KKIAPAY: 'Kkiapay',
  CINETPAY: 'CinetPay',
  FEDAPAY: 'FedaPay',
};

interface ManagerRow {
  id: string;
  name: string;
  email: string;
  eventId: string | null;
  eventTitle: string | null;
}

interface PlatformConfig {
  id: string;
  provider: Provider;
  isActive: boolean;
  publicKey: string | null;
  eventId: string;
}

export default function AdminProvidersPage() {
  const { data: managers, isLoading: managersLoading, isError: managersError } = useQuery({
    queryKey: ['admin-managers'],
    queryFn: () => api<ManagerRow[]>('/api/admin/managers'),
  });
  const { data: configs } = useQuery({
    queryKey: ['admin-payment-configs'],
    queryFn: () => api<PlatformConfig[]>('/api/admin/payment-configs'),
  });

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const configsByEvent = new Map<string, PlatformConfig[]>();
  for (const c of configs ?? []) {
    const list = configsByEvent.get(c.eventId) ?? [];
    list.push(c);
    configsByEvent.set(c.eventId, list);
  }

  const managersWithEvent = (managers ?? []).filter((m) => m.eventId);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paiements</h1>
        <p className="text-sm text-muted-foreground">
          Configurez les identifiants Kkiapay, CinetPay ou FedaPay pour l'événement de chaque
          manager.
        </p>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">
            {managersWithEvent.length} événement{managersWithEvent.length > 1 ? 's' : ''}
          </span>
        </div>

        {managersLoading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        ) : managersError || !managers ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Impossible de charger la liste des managers.
          </div>
        ) : managersWithEvent.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Aucun manager n'a encore d'événement à configurer.
          </div>
        ) : (
          managersWithEvent.map((m, i) => {
            const eventConfigs = configsByEvent.get(m.eventId!) ?? [];
            return (
              <div key={m.id} className={i < managersWithEvent.length - 1 ? 'border-b border-border' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm">
                  <div>
                    <div className="font-medium">{m.eventTitle}</div>
                    <div className="text-xs text-muted-foreground">{m.name} · {m.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {eventConfigs.length === 0 ? (
                      <Badge variant="outline">Paiement non configuré</Badge>
                    ) : (
                      eventConfigs.map((c) => (
                        <Badge key={c.id} variant={c.isActive ? 'success' : 'outline'}>
                          {PROVIDER_LABELS[c.provider]} {c.isActive ? 'actif' : 'inactif'}
                        </Badge>
                      ))
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      title="Configurer"
                      aria-label="Configurer"
                      onClick={() => setExpandedEventId(expandedEventId === m.eventId ? null : m.eventId)}
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {expandedEventId === m.eventId && <PaymentConfigPanel eventId={m.eventId!} />}
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
