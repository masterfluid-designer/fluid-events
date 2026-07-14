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
 *
 * Rangées en flex-wrap (pas de grille à colonnes fixes) — évite le
 * débordement horizontal constaté sur mobile (colonnes coupées à 375px).
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

  const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paiements</h1>
        <p className="text-sm text-muted-foreground">
          Vue plateforme des configurations de paiement, tous événements confondus.
        </p>
      </div>

      <Card className="overflow-hidden py-0">
        <div className="border-b border-border px-4.5 py-3.5">
          <span className="text-sm font-bold">
            {configs ? `${configs.length} configuration${configs.length > 1 ? 's' : ''}` : 'Configurations'}
          </span>
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
                'flex flex-wrap items-center justify-between gap-3 px-4.5 py-3 text-sm' +
                (i < configs.length - 1 ? ' border-b border-border' : '')
              }
            >
              <div>
                <div className="font-medium">
                  {PROVIDER_LABELS[c.provider]} — {c.eventTitle}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.managerName} · {c.managerEmail}
                </div>
                {c.publicKey && (
                  <div className="text-xs text-muted-foreground">clé publique : {c.publicKey}</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Actif' : 'Inactif'}</Badge>
                <Badge variant="secondary">{c.eventStatus}</Badge>
                <span className="text-xs text-muted-foreground">{dateFmt.format(new Date(c.updatedAt))}</span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
