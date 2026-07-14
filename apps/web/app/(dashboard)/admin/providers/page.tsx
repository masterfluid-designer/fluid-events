'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';

/**
 * Page Admin — vue plateforme des configurations de paiement, tous
 * événements confondus (décision produit 2026-07-14). Lecture seule : la
 * configuration des identifiants reste par événement, depuis le panneau
 * ouvert sur la Vue d'ensemble (`/admin` → `PaymentConfigPanel`).
 */

type Provider = 'KKIAPAY' | 'CINETPAY' | 'FEDAPAY';

const PROVIDER_LABELS: Record<Provider, string> = {
  KKIAPAY: 'Kkiapay',
  CINETPAY: 'CinetPay',
  FEDAPAY: 'FedaPay',
};

interface PlatformConfig {
  id: string;
  provider: Provider;
  isActive: boolean;
  publicKey: string | null;
  config: Record<string, unknown> | null;
  updatedAt: string;
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  managerId: string;
  managerName: string;
  managerEmail: string;
}

export default function AdminProvidersPage() {
  const { data: configs, isLoading, isError } = useQuery({
    queryKey: ['admin-payment-configs'],
    queryFn: () => api<PlatformConfig[]>('/api/admin/payment-configs'),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paiements</h1>
        <p className="text-sm text-muted-foreground">
          Vue plateforme des configurations de paiement, tous événements confondus.
        </p>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-[1.2fr_1.4fr_1.4fr_0.8fr_1fr] gap-4 border-b border-border bg-secondary px-4.5 py-3 text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">
          <span>Provider</span>
          <span>Événement</span>
          <span>Manager</span>
          <span>Statut</span>
          <span>Dernière modif.</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner className="size-6" />
          </div>
        ) : isError || !configs ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Impossible de charger les configurations de paiement.
          </div>
        ) : configs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Aucune configuration de paiement enregistrée.
          </div>
        ) : (
          configs.map((c, i) => (
            <div
              key={c.id}
              className={
                'grid grid-cols-[1.2fr_1.4fr_1.4fr_0.8fr_1fr] items-center gap-4 px-4.5 py-3 text-sm' +
                (i < configs.length - 1 ? ' border-b border-border' : '')
              }
            >
              <div>
                <div className="font-medium">{PROVIDER_LABELS[c.provider]}</div>
                {c.publicKey && (
                  <div className="text-xs text-muted-foreground">clé publique : {c.publicKey}</div>
                )}
              </div>
              <div>
                <div className="font-medium">{c.eventTitle}</div>
                <div className="text-xs text-muted-foreground">{c.eventStatus}</div>
              </div>
              <div>
                <div className="font-medium">{c.managerName}</div>
                <div className="text-xs text-muted-foreground">{c.managerEmail}</div>
              </div>
              <div>
                <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Actif' : 'Inactif'}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(
                  new Date(c.updatedAt),
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
