'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Suppression définitive d'un manager (2026-08-22).
 *
 * Le geste le plus destructeur de la plateforme : il emporte les événements,
 * les commandes payées, les billets et les inscriptions. Les acheteurs perdent
 * l'accès à ce qu'ils ont payé sans en être avertis.
 *
 * D'où deux frictions délibérées, qui valent ce qu'elles coûtent :
 *  - l'aperçu annonce les CHIFFRES avant de décider — « supprimer un manager »
 *    ne dit rien, « supprimer 3 événements et 187 billets vendus » dit ce qui
 *    se passe ;
 *  - la confirmation exige de RECOPIER l'adresse email, ce qu'on ne fait pas
 *    par inadvertance.
 */
interface Apercu {
  manager: { id: string; name: string | null; email: string };
  evenements: Array<{ id: string; title: string; slug: string; status: string }>;
  commandesPayees: number;
  montantPaye: number;
  billetsVendus: number;
  inscriptions: number;
  agents: number;
}

export function DialogueSuppression({
  managerId,
  onFerme,
}: {
  managerId: string;
  onFerme: () => void;
}) {
  const queryClient = useQueryClient();
  const [saisie, setSaisie] = useState('');

  const { data: apercu, isLoading } = useQuery({
    queryKey: ['admin-suppression-apercu', managerId],
    queryFn: () => api<Apercu>(`/api/admin/managers/${managerId}/deletion-preview`),
  });

  const supprimer = useMutation({
    mutationFn: () =>
      /*
       * `apiDelete` n'envoie volontairement pas de corps — « les suppressions
       * ne portent que sur l’URL ». Ici la confirmation DOIT voyager avec la
       * requête : on passe donc par `api()` directement, plutôt que d'affaiblir
       * le helper pour tout le monde.
       */
      api(`/api/admin/managers/${managerId}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmationEmail: saisie.trim() }),
      }),
    onSuccess: () => {
      toast.success('Manager supprimé définitivement');
      void queryClient.invalidateQueries({ queryKey: ['admin-managers'] });
      onFerme();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'La suppression n’a pas abouti.');
    },
  });

  const correspond =
    apercu != null && saisie.trim().toLowerCase() === apercu.manager.email.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Supprimer définitivement ce manager ?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cette action est irréversible et ne peut pas être annulée.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : !apercu ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Impossible de charger le détail de ce compte.
          </p>
        ) : (
          <>
            <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
              <div className="font-medium">{apercu.manager.name ?? 'Sans nom'}</div>
              <div className="text-muted-foreground">{apercu.manager.email}</div>

              {/* Les chiffres réels, pas un avertissement générique. */}
              <ul className="mt-3 flex flex-col gap-1 text-muted-foreground">
                <li>
                  <strong className="text-foreground">{apercu.evenements.length}</strong> événement
                  {apercu.evenements.length > 1 ? 's' : ''}
                  {apercu.evenements.length > 0 && (
                    <span> — {apercu.evenements.map((e) => e.title).join(', ')}</span>
                  )}
                </li>
                {apercu.commandesPayees > 0 && (
                  <li className="text-destructive">
                    <strong>{apercu.commandesPayees}</strong> commande
                    {apercu.commandesPayees > 1 ? 's' : ''} payée
                    {apercu.commandesPayees > 1 ? 's' : ''} (
                    {new Intl.NumberFormat('fr-FR').format(apercu.montantPaye)} XOF) et{' '}
                    <strong>{apercu.billetsVendus}</strong> billet
                    {apercu.billetsVendus > 1 ? 's' : ''} — leurs acheteurs perdront l’accès sans
                    être prévenus.
                  </li>
                )}
                {apercu.inscriptions > 0 && (
                  <li>
                    <strong className="text-foreground">{apercu.inscriptions}</strong> inscription
                    {apercu.inscriptions > 1 ? 's' : ''}
                  </li>
                )}
                {apercu.agents > 0 && (
                  <li>
                    <strong className="text-foreground">{apercu.agents}</strong> agent
                    {apercu.agents > 1 ? 's' : ''} de contrôle, dont les comptes seront supprimés
                  </li>
                )}
              </ul>
            </div>

            <label className="mt-5 block text-sm">
              Pour confirmer, recopiez l’adresse{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{apercu.manager.email}</code>
              <input
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                autoComplete="off"
                placeholder={apercu.manager.email}
                className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-destructive"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onFerme} disabled={supprimer.isPending}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!correspond || supprimer.isPending}
                onClick={() => supprimer.mutate()}
              >
                {supprimer.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Supprimer définitivement
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
