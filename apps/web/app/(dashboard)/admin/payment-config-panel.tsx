'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPut, apiPatch, ApiError } from '@/lib/api';

/**
 * PaymentConfigPanel — configuration du fournisseur de paiement PAR
 * ÉVÉNEMENT par l'Admin (décision produit 2026-07-13, supersède
 * BUSINESS.md §6 "un seul compte Kkiapay global").
 *
 * Les 3 providers (Kkiapay, CinetPay, FedaPay) sont exécutables — le backend
 * (`SUPPORTED_PAYMENT_PROVIDERS`) reste la source de vérité si jamais un
 * provider redevenait "identifiants seulement" à l'avenir.
 */

type Provider = 'KKIAPAY' | 'CINETPAY' | 'FEDAPAY';

interface ProviderConfig {
  id: string;
  provider: Provider;
  isActive: boolean;
  publicKey: string | null;
  config: Record<string, unknown> | null;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  KKIAPAY: 'Kkiapay',
  CINETPAY: 'CinetPay',
  FEDAPAY: 'FedaPay',
};

export function PaymentConfigPanel({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['admin-payment-config', eventId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api<{ event: { id: string; title: string }; configs: ProviderConfig[] }>(
      `/api/admin/events/${eventId}/payment-config`,
    ),
  });

  const [provider, setProvider] = useState<Provider>('KKIAPAY');
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [siteId, setSiteId] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [activateOnSave, setActivateOnSave] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const save = useMutation({
    mutationFn: () =>
      apiPut(`/api/admin/events/${eventId}/payment-config`, {
        provider,
        publicKey: publicKey || undefined,
        privateKey,
        webhookSecret,
        siteId: provider === 'CINETPAY' ? siteId : undefined,
        environment: provider === 'FEDAPAY' ? environment : undefined,
        isActive: activateOnSave,
      }),
    onSuccess: () => {
      toast.success(`Identifiants ${PROVIDER_LABELS[provider]} enregistrés`);
      setPublicKey('');
      setPrivateKey('');
      setWebhookSecret('');
      setSiteId('');
      setActivateOnSave(false);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Impossible d'enregistrer les identifiants");
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ provider: p, isActive }: { provider: Provider; isActive: boolean }) =>
      apiPatch(`/api/admin/events/${eventId}/payment-config/${p}`, { isActive }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? `${PROVIDER_LABELS[variables.provider]} activé` : `${PROVIDER_LABELS[variables.provider]} désactivé`);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de changer le statut');
    },
  });

  const remove = useMutation({
    mutationFn: (p: Provider) => api(`/api/admin/events/${eventId}/payment-config/${p}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Configuration supprimée');
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Impossible de supprimer');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="p-4 text-sm text-muted-foreground">Impossible de charger la configuration.</div>;
  }

  return (
    <div className="space-y-4 border-t border-border bg-secondary/40 p-4.5">
      {data.configs.length > 0 && (
        <div className="space-y-2">
          {data.configs.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
              <div>
                <span className="text-sm font-semibold">{PROVIDER_LABELS[c.provider]}</span>
                {c.publicKey && <span className="ml-2 text-xs text-muted-foreground">clé publique : {c.publicKey}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Actif' : 'Inactif'}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate({ provider: c.provider, isActive: !c.isActive })}
                >
                  {c.isActive ? 'Désactiver' : 'Activer'}
                </Button>
                <button
                  type="button"
                  aria-label="Supprimer"
                  onClick={() => remove.mutate(c.provider)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-1 gap-2.5 md:grid-cols-2"
      >
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
        >
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>

        {(provider === 'KKIAPAY' || provider === 'FEDAPAY') && (
          <Input
            required
            placeholder="Clé publique"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
          />
        )}
        <Input
          required
          type="password"
          placeholder={provider === 'CINETPAY' ? 'API key' : 'Clé secrète'}
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
        />
        <Input
          required
          type="password"
          placeholder={provider === 'CINETPAY' ? 'Secret HMAC (x-token)' : 'Secret webhook'}
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
        {provider === 'CINETPAY' && (
          <Input required placeholder="Site ID" value={siteId} onChange={(e) => setSiteId(e.target.value)} />
        )}
        {provider === 'FEDAPAY' && (
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'live')}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
        )}

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={activateOnSave}
            onChange={(e) => setActivateOnSave(e.target.checked)}
          />
          Activer immédiatement
        </label>

        <Button type="submit" size="sm" disabled={save.isPending} className="md:col-span-2 w-fit">
          {save.isPending ? 'Enregistrement...' : 'Enregistrer les identifiants'}
        </Button>
      </form>
    </div>
  );
}
