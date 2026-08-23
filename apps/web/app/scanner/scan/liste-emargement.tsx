'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, LogOut, Search, UserCheck, Users, X, WifiOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Liste d'émargement — le contrôle d'accès des événements sur inscription
 * (2026-08-23).
 *
 * Un événement sur inscription n'émet aucun billet, donc aucun QR : ses agents
 * de contrôle ouvraient jusqu'ici une caméra braquée sur rien. Le geste à la
 * porte n'est pas « scanner », c'est **chercher un nom et le cocher**.
 *
 * Trois partis pris, tous dictés par la porte plutôt que par l'écran :
 *
 *  - **La liste entière est chargée d'un coup**, et la recherche se fait dans
 *    le téléphone. Une recherche qui repasse par le réseau à chaque lettre est
 *    inutilisable dans une salle des fêtes ; ici elle répond instantanément et
 *    survit à une coupure — seul le pointage a besoin du réseau.
 *  - **La recherche ignore les accents et la casse** : on tape « konate » à
 *    une main, debout, pour trouver « Konaté ».
 *  - **Le pointage est réversible et optimiste** : la ligne bascule tout de
 *    suite, et revient si le serveur refuse. Faire attendre l'agent devant
 *    quelqu'un qui patiente vaut moins qu'un rare retour en arrière.
 */
interface Inscrit {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  extraLabel: string | null;
  extraValue: string | null;
  checkedInAt: string | null;
}

interface ListeAgent {
  total: number;
  presents: number;
  items: Inscrit[];
  tronquee: boolean;
}

type Filtre = 'tous' | 'attendus' | 'arrives';

/** Enlève accents et casse — « Konaté » et « konate » doivent se rejoindre. */
function aplatir(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function ListeEmargement({
  eventTitle,
  onLogout,
}: {
  eventTitle: string | null;
  onLogout: () => void;
}) {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');

  const cle = ['emargement'] as const;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: cle,
    queryFn: () => api<ListeAgent>('/api/scan/registrations'),
    /*
     * Deux agents sur deux portes travaillent sur la même liste. Sans
     * rafraîchissement, chacun continuerait d'appeler des noms que l'autre a
     * déjà fait entrer.
     */
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const pointer = useMutation({
    mutationFn: ({ id, present }: { id: string; present: boolean }) =>
      api<{ id: string; checkedInAt: string | null }>(`/api/scan/registrations/${id}/check-in`, {
        method: 'PATCH',
        body: JSON.stringify({ present }),
      }),

    // Bascule immédiate, avant la réponse : c'est ce que l'agent regarde.
    onMutate: async ({ id, present }) => {
      await queryClient.cancelQueries({ queryKey: cle });
      const avant = queryClient.getQueryData<ListeAgent>(cle);
      queryClient.setQueryData<ListeAgent>(cle, (ancien) =>
        ancien
          ? {
              ...ancien,
              presents: ancien.presents + (present ? 1 : -1),
              items: ancien.items.map((i) =>
                i.id === id ? { ...i, checkedInAt: present ? new Date().toISOString() : null } : i,
              ),
            }
          : ancien,
      );
      return { avant };
    },

    onError: (_err, _variables, contexte) => {
      // Retour à l'état d'avant : une coche qui reste alors que rien n'a été
      // enregistré ferait entrer quelqu'un deux fois, ou pas du tout.
      if (contexte?.avant) queryClient.setQueryData(cle, contexte.avant);
      toast.error('Pointage non enregistré — réessayez.');
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: cle });
    },
  });

  const filtres = useMemo(() => {
    const items = data?.items ?? [];
    const terme = aplatir(recherche.trim());

    return items.filter((i) => {
      if (filtre === 'attendus' && i.checkedInAt) return false;
      if (filtre === 'arrives' && !i.checkedInAt) return false;
      if (!terme) return true;

      return aplatir(`${i.firstName} ${i.lastName} ${i.email} ${i.phone ?? ''}`).includes(terme);
    });
  }, [data?.items, recherche, filtre]);

  const total = data?.total ?? 0;
  const presents = data?.presents ?? 0;

  return (
    <main className="min-h-svh bg-black text-white">
      <div className="mx-auto flex min-h-svh max-w-md flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-black/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{eventTitle ?? 'Liste d’émargement'}</div>
              <div className="text-xs text-white/40">Contrôle par liste</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label="Se déconnecter"
              className="shrink-0 text-white/50 hover:text-white"
            >
              <LogOut className="size-4" />
            </Button>
          </div>

          {/*
            Le compteur d'abord : à la porte, la seule question qui revient est
            « combien sont entrés ? ». Elle ne doit pas se déduire d'un défilement.
          */}
          <div className="flex items-baseline gap-2 px-4 pt-3">
            <span className="text-3xl font-bold tabular-nums text-[oklch(70%_0.16_145)]">
              {presents}
            </span>
            <span className="text-lg text-white/40">/ {total}</span>
            <span className="text-xs text-white/40">arrivés</span>
            {isFetching && <Spinner className="ml-auto size-3.5 text-white/30" />}
          </div>

          <div className="mt-3 flex items-center gap-2 px-4">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2.5">
              <Search className="size-4 shrink-0 text-white/40" />
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, email, téléphone…"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full bg-transparent text-base outline-none placeholder:text-white/30"
              />
              {recherche && (
                <button
                  type="button"
                  onClick={() => setRecherche('')}
                  aria-label="Effacer la recherche"
                  className="shrink-0 text-white/40"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {(
              [
                ['tous', 'Tous', total],
                ['attendus', 'Attendus', total - presents],
                ['arrives', 'Arrivés', presents],
              ] as Array<[Filtre, string, number]>
            ).map(([valeur, libelle, compte]) => (
              <button
                key={valeur}
                type="button"
                onClick={() => setFiltre(valeur)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filtre === valeur
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/60 hover:bg-white/15'
                }`}
              >
                {libelle} · {compte}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 px-4 pb-8">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner className="size-6" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <WifiOff className="size-8 text-white/30" />
              <p className="text-sm text-white/50">
                Liste indisponible. Vérifiez la connexion, puis réessayez.
              </p>
              <Button size="sm" onClick={() => void refetch()}>
                Réessayer
              </Button>
            </div>
          ) : filtres.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Users className="size-8 text-white/25" />
              <p className="text-sm text-white/50">
                {total === 0
                  ? 'Personne ne s’est encore inscrit à cet événement.'
                  : recherche
                    ? `Aucun inscrit ne correspond à « ${recherche} ».`
                    : 'Aucun inscrit dans cette catégorie.'}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtres.map((i) => {
                const arrive = Boolean(i.checkedInAt);
                return (
                  <li key={i.id}>
                    {/*
                      La ligne entière est le bouton : viser une case à cocher
                      de 20 px avec un pouce, dans le noir, ne marche pas.
                    */}
                    <button
                      type="button"
                      onClick={() => pointer.mutate({ id: i.id, present: !arrive })}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        arrive
                          ? 'border-[oklch(58%_0.16_145)]/50 bg-[oklch(58%_0.16_145)]/15'
                          : 'border-white/10 bg-[#141312] active:bg-white/10'
                      }`}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                          arrive
                            ? 'bg-[oklch(58%_0.16_145)] text-black'
                            : 'border border-white/20 text-white/30'
                        }`}
                      >
                        {arrive ? <Check className="size-5" /> : <UserCheck className="size-4" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {i.lastName.toUpperCase()} {i.firstName}
                        </span>
                        <span className="block truncate text-xs text-white/40">
                          {i.phone ?? i.email}
                        </span>
                        {i.extraValue && (
                          <span className="mt-1 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">
                            {i.extraLabel ? `${i.extraLabel} : ` : ''}
                            {i.extraValue}
                          </span>
                        )}
                      </span>

                      {arrive && i.checkedInAt && (
                        <span className="shrink-0 text-xs tabular-nums text-[oklch(70%_0.16_145)]">
                          {heure(i.checkedInAt)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/*
            Le plafond serveur est atteint : le dire vaut mieux que de laisser
            un agent chercher un nom qui n'a jamais été chargé.
          */}
          {data?.tronquee && (
            <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              Cette liste dépasse 2 000 inscrits : seuls les 2 000 premiers noms sont chargés.
              Prévenez l’organisateur.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
