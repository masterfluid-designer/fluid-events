'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPut, ApiError } from '@/lib/api';

/**
 * Admin — Messagerie WhatsApp (Meta Cloud API), 2026-08-19.
 *
 * Ces réglages ne vivaient qu'en variables d'environnement : changer de
 * numéro ou de modèle approuvé imposait un accès SSH au serveur et un
 * redémarrage. Ils se règlent désormais ici.
 *
 * Le jeton n'est jamais relu : l'API dit seulement s'il est renseigné. Le
 * laisser vide conserve celui déjà en place — même règle que les clés de
 * paiement (RULES.md §9).
 */

interface WhatsappConfig {
  hasAccessToken: boolean;
  phoneNumberId: string | null;
  apiVersion: string | null;
  ticketTemplate: string | null;
  ticketLang: string | null;
  verifyTemplate: string | null;
  verifyLang: string | null;
  /** L'installation tourne-t-elle encore sur les variables d'environnement ? */
  environmentFallback: boolean;
}

export default function AdminWhatsappPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-whatsapp-config'],
    queryFn: () => api<WhatsappConfig>('/api/admin/whatsapp-config'),
  });

  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [apiVersion, setApiVersion] = useState('');
  const [ticketTemplate, setTicketTemplate] = useState('');
  const [ticketLang, setTicketLang] = useState('fr');
  const [verifyTemplate, setVerifyTemplate] = useState('');
  const [verifyLang, setVerifyLang] = useState('fr');

  // Amorce unique : on ne réécrit pas une saisie en cours à chaque refetch.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!data || loaded) return;
    setPhoneNumberId(data.phoneNumberId ?? '');
    setApiVersion(data.apiVersion ?? '');
    setTicketTemplate(data.ticketTemplate ?? '');
    setTicketLang(data.ticketLang ?? 'fr');
    setVerifyTemplate(data.verifyTemplate ?? '');
    setVerifyLang(data.verifyLang ?? 'fr');
    setLoaded(true);
  }, [data, loaded]);

  const save = useMutation({
    mutationFn: () =>
      apiPut('/api/admin/whatsapp-config', {
        // Jeton vide = on garde celui en place. Pour l'effacer il y a un
        // bouton dédié : un champ laissé vide par distraction ne doit pas
        // couper la messagerie.
        ...(accessToken ? { accessToken } : {}),
        phoneNumberId,
        apiVersion,
        ticketTemplate,
        ticketLang,
        verifyTemplate,
        verifyLang,
      }),
    onSuccess: () => {
      toast.success('Messagerie enregistrée');
      setAccessToken('');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp-config'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    },
  });

  const clearToken = useMutation({
    mutationFn: () => apiPut('/api/admin/whatsapp-config', { accessToken: '' }),
    onSuccess: () => {
      toast.success('Jeton retiré — plus aucun message ne partira');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp-config'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Retrait impossible');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Réglages illisibles.</div>;
  }

  const actif = data.hasAccessToken && Boolean(data.phoneNumberId);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messagerie WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Envoi des billets et des codes de vérification via l&apos;API Meta Cloud.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-4" /> État
          </CardTitle>
          <CardDescription>
            {actif
              ? 'Configurée ici — les messages partent avec ces réglages.'
              : data.environmentFallback
                ? 'Non configurée ici, mais des variables d’environnement prennent le relais : les envois fonctionnent déjà.'
                : 'Non configurée. Aucun message WhatsApp ne part — ni billets, ni codes de vérification.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground md:col-span-2">
            Jeton d&apos;accès permanent
            <Input
              type="password"
              placeholder={data.hasAccessToken ? '•••••••• (déjà enregistré)' : 'EAAG...'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <span className="text-[11px]">
              Laissez vide pour conserver le jeton actuel. Il n&apos;est jamais réaffiché.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Identifiant du numéro (Phone Number ID)
            <Input
              placeholder="111222333444555"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Version de l&apos;API
            <Input
              placeholder="v21.0"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Modèle « billets prêts »
            <Input
              placeholder="ticket_ready"
              value={ticketTemplate}
              onChange={(e) => setTicketTemplate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Langue du modèle
            <select
              value={ticketLang}
              onChange={(e) => setTicketLang(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="fr">fr</option>
              <option value="fr_FR">fr_FR</option>
              <option value="en">en</option>
              <option value="en_US">en_US</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Modèle « code de vérification »
            <Input
              placeholder="phone_verification"
              value={verifyTemplate}
              onChange={(e) => setVerifyTemplate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            Langue du modèle
            <select
              value={verifyLang}
              onChange={(e) => setVerifyLang(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="fr">fr</option>
              <option value="fr_FR">fr_FR</option>
              <option value="en">en</option>
              <option value="en_US">en_US</option>
            </select>
          </label>

          <p className="text-[11px] text-muted-foreground md:col-span-2">
            Les noms de modèles doivent correspondre à des modèles <strong>approuvés</strong> dans
            Meta Business Manager. Meta interdit le texte libre : un modèle non validé est refusé à
            l&apos;envoi.
          </p>

          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
            {data.hasAccessToken && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearToken.mutate()}
                disabled={clearToken.isPending}
              >
                Retirer le jeton
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
