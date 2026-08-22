'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Ticket, UserCheck, ClipboardList, Loader2 } from 'lucide-react';
import { EventAccessMode } from '@saas-events/types';
import { apiPatch, ApiError } from '@/lib/api';
import { avecEvenement } from '@/lib/evenement-actif';

/**
 * Panneau « Régime d'accès » (lot 3, 2026-08-22).
 *
 * Changer de régime change ce que la page publique montre et ce que le
 * visiteur peut faire. C'est une décision, pas un réglage parmi d'autres :
 * elle passe donc par une confirmation qui annonce ce qui est CONSERVÉ,
 * chiffres à l'appui, plutôt qu'un avertissement vague.
 */
const REGIMES: Array<{
  mode: EventAccessMode;
  icone: typeof Ticket;
  titre: string;
  resume: string;
}> = [
  {
    mode: EventAccessMode.TICKETED_ACCOUNT,
    icone: UserCheck,
    titre: 'Billetterie avec compte',
    resume: 'L’acheteur crée un compte et retrouve ses billets dans son espace.',
  },
  {
    mode: EventAccessMode.TICKETED_GUEST,
    icone: Ticket,
    titre: 'Billetterie sans compte',
    resume: 'Achat en quelques champs. Le billet arrive par email, sans mot de passe.',
  },
  {
    mode: EventAccessMode.RSVP,
    icone: ClipboardList,
    titre: 'Inscription simple',
    resume: 'Ni billet ni paiement : un formulaire, et la liste de qui vient.',
  },
];

export function PanneauRegime({
  actuel,
  evenement,
  commandesPayees,
  inscriptions,
}: {
  actuel: EventAccessMode;
  evenement?: string;
  /** Nombre de commandes payées — commande ce qui est encore permis. */
  commandesPayees: number;
  inscriptions: number;
}) {
  const queryClient = useQueryClient();
  const [cible, setCible] = useState<EventAccessMode | null>(null);

  const basculer = useMutation({
    mutationFn: (mode: EventAccessMode) =>
      apiPatch(avecEvenement('/api/events/mine', evenement), { accessMode: mode }),
    onSuccess: () => {
      toast.success('Régime d’accès mis à jour');
      setCible(null);
      void queryClient.invalidateQueries({ queryKey: ['manager-event'] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Le changement n’a pas pu être enregistré.',
      );
    },
  });

  /**
   * Quitter la billetterie avec des places vendues retirerait leur page
   * d'accès à des gens qui ont payé. Le serveur refuse ; on le dit ici, pour
   * que l'organisateur le sache AVANT de cliquer.
   */
  function verrouille(mode: EventAccessMode): string | null {
    const quitteLaBilletterie = actuel !== EventAccessMode.RSVP && mode === EventAccessMode.RSVP;
    if (quitteLaBilletterie && commandesPayees > 0) {
      return `${commandesPayees} commande${commandesPayees > 1 ? 's' : ''} déjà payée${
        commandesPayees > 1 ? 's' : ''
      } — la billetterie ne peut plus être retirée.`;
    }
    return null;
  }

  const choisi = REGIMES.find((r) => r.mode === cible);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-xs font-semibold">Régime d’accès</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Ce que le visiteur peut faire sur votre page.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {REGIMES.map((regime) => {
          const Icone = regime.icone;
          const estActuel = regime.mode === actuel;
          const raison = verrouille(regime.mode);

          return (
            <button
              key={regime.mode}
              type="button"
              disabled={estActuel || Boolean(raison) || basculer.isPending}
              onClick={() => setCible(regime.mode)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                estActuel
                  ? 'border-primary bg-primary/5'
                  : raison
                    ? 'cursor-not-allowed border-border opacity-55'
                    : 'border-border hover:bg-accent'
              }`}
            >
              <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {regime.titre}
                  {estActuel && <span className="ml-2 text-[11px] text-primary">Actuel</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">{regime.resume}</span>
                {raison && <span className="text-[11px] text-destructive">{raison}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {choisi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
            <h3 className="text-base font-semibold">Passer en « {choisi.titre} » ?</h3>

            {/*
              Ce que la bascule CONSERVE, avec les chiffres réels. Un
              avertissement générique laisserait croire à une perte, et
              l'organisateur reculerait devant un changement inoffensif.
            */}
            <ul className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                Vos blocs de page sont <strong className="text-foreground">tous conservés</strong>.
                Ceux qui ne servent pas à ce régime cessent d’être affichés, et reviennent
                identiques si vous changez d’avis.
              </li>
              {commandesPayees > 0 && (
                <li>
                  Vos <strong className="text-foreground">{commandesPayees} commande(s) payée(s)</strong>{' '}
                  restent valables, scannables et exportables.
                </li>
              )}
              {inscriptions > 0 && (
                <li>
                  Vos <strong className="text-foreground">{inscriptions} inscription(s)</strong>{' '}
                  restent consultables et exportables.
                </li>
              )}
              <li>Le changement est consigné, et reste réversible.</li>
            </ul>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCible(null)}
                disabled={basculer.isPending}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => basculer.mutate(choisi.mode)}
                disabled={basculer.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {basculer.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
