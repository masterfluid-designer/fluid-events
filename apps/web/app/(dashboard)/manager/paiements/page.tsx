'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard, CheckCircle2, AlertTriangle, Trash2, Pencil, Plus } from 'lucide-react';
import { PaymentProviderType } from '@saas-events/types';
import { api, ApiError } from '@/lib/api';
import { avecEvenement, useEvenementActif, useMesEvenements } from '@/lib/evenement-actif';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FICHES_CONFIGURABLES, fiche, urlWebhook } from '@/lib/catalogue-paiement';
import { Documentation } from './documentation';
import { FormulaireCles, type ValeursCles } from './formulaire-cles';

/**
 * Encaissement — réglé par l'organisateur (2026-08-24).
 *
 * Jusqu'ici, seul un Admin pouvait poser les clés de paiement. C'était LE
 * goulot d'étranglement de la plateforme : `payment_provider_configs` est resté
 * vide en production, et pas un billet n'a jamais pu être encaissé.
 *
 * Trois partis pris tiennent cette page :
 *
 *  - **Rien ne se relit.** Le serveur ne renvoie aucune clé ; l'écran dit
 *    seulement qu'un fournisseur est configuré, et depuis quand.
 *  - **Rien ne part sans confirmation.** Enregistrer, activer, supprimer :
 *    chacun passe par une boîte qui nomme ce qui va se produire, y compris le
 *    nombre d'événements touchés.
 *  - **La documentation est sur la même page.** On la lit d'une main pendant
 *    qu'on remplit de l'autre.
 */
interface ConfigPaiement {
  id: string;
  provider: PaymentProviderType;
  isActive: boolean;
  isGlobal: boolean;
  config: { siteId?: string; environment?: string } | null;
  updatedAt: string;
}

type EnAttente =
  | { genre: 'enregistrer'; valeurs: ValeursCles }
  | { genre: 'activer'; provider: PaymentProviderType; isActive: boolean }
  | { genre: 'supprimer'; provider: PaymentProviderType };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PagePaiements() {
  const evenement = useEvenementActif();
  const { data: mesEvenements } = useMesEvenements();
  const queryClient = useQueryClient();

  const [ouvert, setOuvert] = useState<PaymentProviderType | null>(null);
  const [enAttente, setEnAttente] = useState<EnAttente | null>(null);

  const nbEvenements = mesEvenements?.length ?? 1;
  const plusieursEvenements = nbEvenements > 1;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['paiements-config', evenement],
    queryFn: () =>
      api<{ eventId: string; configs: ConfigPaiement[] }>(
        avecEvenement('/api/payments/config', evenement),
      ),
  });

  const configs = data?.configs ?? [];
  const actif = configs.find((c) => c.isActive) ?? null;

  function rafraichir() {
    void queryClient.invalidateQueries({ queryKey: ['paiements-config'] });
    void queryClient.invalidateQueries({ queryKey: ['mes-evenements'] });
  }

  const enregistrer = useMutation({
    mutationFn: (v: ValeursCles) =>
      api(avecEvenement('/api/payments/config', evenement), {
        method: 'PUT',
        body: JSON.stringify(v),
      }),
    onSuccess: (_r, v) => {
      toast.success(
        v.global
          ? `Identifiants enregistrés sur vos ${nbEvenements} événements`
          : 'Identifiants enregistrés',
      );
      setOuvert(null);
      rafraichir();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Enregistrement impossible.'),
  });

  const basculer = useMutation({
    mutationFn: ({ provider, isActive }: { provider: PaymentProviderType; isActive: boolean }) =>
      api(avecEvenement(`/api/payments/config/${provider}/active`, evenement), {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_r, v) => {
      toast.success(v.isActive ? 'Moyen de paiement activé' : 'Moyen de paiement désactivé');
      rafraichir();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Action impossible.'),
  });

  const supprimer = useMutation({
    mutationFn: (provider: PaymentProviderType) =>
      api(avecEvenement(`/api/payments/config/${provider}`, evenement), { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Identifiants supprimés');
      rafraichir();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Suppression impossible.'),
  });

  const enCours = enregistrer.isPending || basculer.isPending || supprimer.isPending;

  function confirmer() {
    if (!enAttente) return;
    if (enAttente.genre === 'enregistrer') enregistrer.mutate(enAttente.valeurs);
    if (enAttente.genre === 'activer') basculer.mutate(enAttente);
    if (enAttente.genre === 'supprimer') supprimer.mutate(enAttente.provider);
    setEnAttente(null);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Encaissement</h1>
        <p className="text-sm text-muted-foreground">
          Vos propres comptes marchands, vos propres clés. L’argent de vos billets arrive
          directement chez vous.
        </p>
      </div>

      {/*
        L'alerte qui compte : un événement qui vend sans fournisseur actif
        affiche une billetterie incapable d'encaisser.
      */}
      {!isLoading && !actif && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Aucun moyen de paiement actif sur cet événement.</strong> Sa page publique
            s’affiche, mais personne ne peut y acheter de billet. Choisissez un fournisseur
            ci-dessous — la documentation en bas de page explique où trouver chaque identifiant.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="size-6" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Impossible de charger votre configuration. Rechargez la page.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {FICHES_CONFIGURABLES.map((f) => {
            const provider = f.id as PaymentProviderType;
            const config = configs.find((c) => c.provider === provider);
            const enEdition = ouvert === provider;

            return (
              <Card key={f.id} className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <CreditCard className="size-4 text-muted-foreground" />
                      {f.nom}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{f.resume}</p>
                  </div>
                  {config?.isActive && (
                    <Badge variant="success" className="shrink-0">
                      ● Actif
                    </Badge>
                  )}
                </div>

                {config ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      Identifiants enregistrés le {dateCourte(config.updatedAt)}
                    </span>
                    {config.config?.environment && (
                      <Badge variant={config.config.environment === 'live' ? 'secondary' : 'warning'}>
                        {config.config.environment === 'live' ? 'Production' : 'Bac à sable'}
                      </Badge>
                    )}
                    {config.isGlobal && <Badge variant="secondary">Tous mes événements</Badge>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun identifiant enregistré.</p>
                )}

                {enEdition ? (
                  <div className="border-t border-border pt-4">
                    <FormulaireCles
                      fiche={f}
                      dejaConfigure={Boolean(config)}
                      plusieursEvenements={plusieursEvenements}
                      urlNotification={urlWebhook(String(f.id), API_BASE)}
                      enCours={enCours}
                      onCancel={() => setOuvert(null)}
                      onSubmit={(valeurs) => setEnAttente({ genre: 'enregistrer', valeurs })}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button size="sm" variant={config ? 'outline' : 'default'} onClick={() => setOuvert(provider)}>
                      {config ? (
                        <>
                          <Pencil className="size-3.5" />
                          Remplacer les clés
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" />
                          Configurer
                        </>
                      )}
                    </Button>

                    {config && !config.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEnAttente({ genre: 'activer', provider, isActive: true })}
                      >
                        Activer
                      </Button>
                    )}
                    {config?.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEnAttente({ genre: 'activer', provider, isActive: false })}
                      >
                        Désactiver
                      </Button>
                    )}
                    {config && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setEnAttente({ genre: 'supprimer', provider })}
                      >
                        <Trash2 className="size-3.5" />
                        Supprimer
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Documentation apiBase={API_BASE} />

      {/*
        Une confirmation par geste. Chacune NOMME ce qui va se produire —
        combien d'événements, quel fournisseur sera désactivé au passage —
        plutôt qu'un « Êtes-vous sûr ? » qui n'apprend rien.
      */}
      <ConfirmDialog
        open={enAttente !== null}
        title={
          enAttente?.genre === 'supprimer'
            ? 'Supprimer ces identifiants ?'
            : enAttente?.genre === 'activer'
              ? enAttente.isActive
                ? 'Activer ce moyen de paiement ?'
                : 'Désactiver ce moyen de paiement ?'
              : 'Enregistrer ces identifiants ?'
        }
        confirmLabel={
          enAttente?.genre === 'supprimer'
            ? 'Supprimer'
            : enAttente?.genre === 'activer'
              ? enAttente.isActive
                ? 'Activer'
                : 'Désactiver'
              : 'Enregistrer'
        }
        pending={enCours}
        onCancel={() => setEnAttente(null)}
        onConfirm={confirmer}
        description={
          enAttente?.genre === 'enregistrer' ? (
            <span className="flex flex-col gap-2">
              <span>
                Les identifiants {fiche(enAttente.valeurs.provider)?.nom} vont être chiffrés et
                enregistrés. <strong>Ils ne pourront plus être réaffichés</strong> — vérifiez-les
                avant de valider.
              </span>
              {enAttente.valeurs.global && (
                <span>
                  Ils seront recopiés sur <strong>vos {nbEvenements} événements</strong>, et sur
                  ceux que vous créerez ensuite.
                </span>
              )}
              {enAttente.valeurs.isActive && actif && actif.provider !== enAttente.valeurs.provider && (
                <span>
                  {fiche(actif.provider)?.nom} sera <strong>désactivé</strong> : un seul
                  fournisseur encaisse à la fois.
                </span>
              )}
              {enAttente.valeurs.environment === 'sandbox' && (
                <span className="text-amber-700 dark:text-amber-400">
                  Mode bac à sable : aucun paiement réel ne sera encaissé.
                </span>
              )}
            </span>
          ) : enAttente?.genre === 'activer' ? (
            enAttente.isActive ? (
              <span>
                {fiche(enAttente.provider)?.nom} deviendra le moyen de paiement de cet événement.
                {actif && actif.provider !== enAttente.provider && (
                  <>
                    {' '}
                    {fiche(actif.provider)?.nom} sera désactivé.
                  </>
                )}
              </span>
            ) : (
              <span>
                Plus aucun billet ne pourra être acheté sur cet événement tant qu’un autre moyen
                n’aura pas été activé.
              </span>
            )
          ) : enAttente?.genre === 'supprimer' ? (
            <span>
              Les identifiants {fiche(enAttente.provider)?.nom} de cet événement seront effacés.
              Comme ils ne sont jamais réaffichés, il faudra les <strong>ressaisir entièrement</strong>{' '}
              pour revenir en arrière.
            </span>
          ) : null
        }
      />
    </div>
  );
}
