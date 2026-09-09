'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { avecEvenement, lienDashboard, useEvenementActif } from '@/lib/evenement-actif';

/**
 * Alertes d'événement — ce qui est en place mais ne sert à rien (2026-09-09).
 *
 * La liste de prise en main coche ce qui a été FAIT ; elle est muette sur ce
 * qui a été fait à moitié. Or c'est là que se perdent les données, et
 * silencieusement : un organisateur avait composé son questionnaire le
 * 2 septembre sans jamais cocher « afficher ». Cinq personnes se sont
 * inscrites derrière, aucune n'a vu la question, et il ne l'a jamais su. Rien
 * n'était en panne — c'est bien ce qui rend l'affaire coûteuse.
 *
 * Trois choix tiennent ce composant :
 *
 *  - **Il vit sur le tableau de bord, pas dans le guide flottant.** Le guide
 *    disparaît une fois la liste terminée ; or le travail dormant ne commence
 *    à coûter qu'une fois l'événement en ligne, c'est-à-dire précisément quand
 *    le guide n'est plus là.
 *  - **Il ne se ferme pas.** Une alerte qu'on peut écarter d'un clic est une
 *    alerte qu'on écarte. Elle disparaît quand le problème est réglé, jamais
 *    avant.
 *  - **Il partage la requête de la prise en main** (même clé React Query) :
 *    l'écran ne paie pas un aller-retour de plus pour dire ce que le serveur
 *    avait déjà calculé.
 */
interface Alerte {
  cle: string;
  questions?: number;
  inscrits?: number;
}

interface Onboarding {
  eventId: string;
  alertes?: Alerte[];
}

export function AlertesEvenement() {
  const evenement = useEvenementActif();

  const { data } = useQuery({
    queryKey: ['onboarding', evenement],
    queryFn: () => api<Onboarding>(avecEvenement('/api/events/mine/onboarding', evenement)),
    refetchOnWindowFocus: true,
    retry: false,
  });

  const alertes = data?.alertes ?? [];
  if (alertes.length === 0) return null;

  return (
    <div className="space-y-3">
      {alertes.map((alerte) => {
        if (alerte.cle !== 'questionnaire-dormant') return null;

        const questions = alerte.questions ?? 0;
        const inscrits = alerte.inscrits ?? 0;

        return (
          <div
            key={alerte.cle}
            className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-400"
          >
            <EyeOff className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p>
                Votre questionnaire ({questions} question{questions > 1 ? 's' : ''}) est{' '}
                <strong>enregistré mais masqué</strong> : personne ne le voit sur votre page
                d’inscription.
              </p>
              {/*
                Le chiffre fait le message. « Cochez la case » n'a pas suffi la
                première fois ; « 5 inscrits n'ont pas vu vos questions » se
                comprend sans effort, et ces réponses-là ne se rattrapent pas.
              */}
              {inscrits > 0 && (
                <p className="mt-1">
                  {inscrits} personne{inscrits > 1 ? 's se sont inscrites' : ' s’est inscrite'} sans
                  y répondre. Ces réponses ne peuvent pas être récupérées.
                </p>
              )}
              <Link
                href={lienDashboard('/manager/formulaire', evenement)}
                className="mt-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:no-underline"
              >
                Afficher le questionnaire
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
