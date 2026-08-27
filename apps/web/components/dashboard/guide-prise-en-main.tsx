'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Rocket, X, PartyPopper } from 'lucide-react';
import { EventAccessMode } from '@saas-events/types';
import { api } from '@/lib/api';
import { avecEvenement, lienDashboard, useEvenementActif } from '@/lib/evenement-actif';

/**
 * Guide de prise en main — la boîte flottante des premiers jours (2026-08-27).
 *
 * Un organisateur qui arrive découvre neuf entrées de menu et aucune idée de
 * l'ordre dans lequel s'y prendre. Il compose sa page, publie, et s'aperçoit
 * trois jours plus tard que personne n'a pu acheter — l'encaissement n'était
 * pas branché. La plateforme ne le lui avait jamais dit AVANT.
 *
 * Quatre partis pris, tous empruntés à ce qui marche ailleurs (Stripe, Linear,
 * Notion) et tous motivés par ce que cette boîte doit éviter :
 *
 *  - **Elle dit la vérité de la base**, pas un souvenir local. Chaque case est
 *    calculée côté serveur à partir de la donnée qui la porte : une liste qui
 *    coche « billetterie prête » sur une table vide vaut moins que pas de liste.
 *  - **Elle se replie en pastille** et ne masque jamais le travail. Un panneau
 *    qui recouvre l'écran se fait fermer une fois, définitivement.
 *  - **Elle disparaît d'elle-même** quand tout est fait. Une liste entièrement
 *    cochée qui reste affichée devient un meuble.
 *  - **Elle se ferme pour de bon si on le demande**, et s'en souvient par
 *    événement : un organisateur aguerri qui monte sa huitième soirée n'a pas
 *    à refuser le tutoriel huit fois.
 */
interface EtapeApi {
  cle: string;
  faite: boolean;
}

interface Onboarding {
  eventId: string;
  eventTitle: string;
  accessMode: EventAccessMode;
  etapes: EtapeApi[];
  faites: number;
  total: number;
}

/** Ce que chaque étape veut dire, et où elle mène. */
const LIBELLES: Record<string, { titre: string; aide: string; chemin: string; action: string }> = {
  page: {
    titre: 'Composez votre page publique',
    aide: 'Affiche, présentation, programme, plan d’accès — bloc par bloc.',
    chemin: '/manager/builder',
    action: 'Ouvrir l’éditeur',
  },
  billets: {
    titre: 'Créez vos tarifs',
    aide: 'Un tarif au moins, avec son prix et son stock.',
    chemin: '/manager/tickets',
    action: 'Ajouter un tarif',
  },
  encaissement: {
    titre: 'Branchez votre encaissement',
    aide: 'Vos clés, votre compte marchand. Sans lui, personne ne peut acheter.',
    chemin: '/manager/paiements',
    action: 'Configurer',
  },
  agents: {
    titre: 'Invitez vos agents de contrôle',
    aide: 'Ceux qui scanneront les billets — ou pointeront les inscrits — à l’entrée.',
    chemin: '/manager/scanners',
    action: 'Inviter',
  },
  publication: {
    titre: 'Publiez l’événement',
    aide: 'Tant qu’il est en brouillon, sa page publique répond « introuvable ».',
    chemin: '/manager',
    action: 'Aller au tableau de bord',
  },
};

/** Mémorise le renoncement PAR ÉVÉNEMENT — voir le commentaire d'en-tête. */
function cleFermeture(eventId: string): string {
  return `fluid:guide-ferme:${eventId}`;
}

function estFerme(eventId: string): boolean {
  try {
    return window.localStorage.getItem(cleFermeture(eventId)) === '1';
  } catch {
    // Navigation privée, stockage bloqué : on montre le guide plutôt que de
    // faire disparaître une aide à cause d'un réglage de navigateur.
    return false;
  }
}

export function GuidePriseEnMain() {
  const pathname = usePathname();
  const evenement = useEvenementActif();

  const [ouvert, setOuvert] = useState(false);
  const [ferme, setFerme] = useState(true);

  /*
   * Réservé à l'organisateur : l'Admin n'a pas d'événement à monter, et le
   * guide n'aurait rien à lui cocher.
   */
  const pourManager = pathname?.startsWith('/manager') ?? false;

  const { data } = useQuery({
    queryKey: ['onboarding', evenement],
    queryFn: () => api<Onboarding>(avecEvenement('/api/events/mine/onboarding', evenement)),
    enabled: pourManager,
    // Chaque étape se coche en quittant une autre page : on relit au retour.
    refetchOnWindowFocus: true,
    retry: false,
  });

  // `localStorage` ne se lit qu'après le montage : le serveur ne l'a pas.
  useEffect(() => {
    if (!data?.eventId) return;
    setFerme(estFerme(data.eventId));
  }, [data?.eventId]);

  if (!pourManager || !data) return null;

  const termine = data.faites >= data.total;
  if (termine || ferme) return null;

  function fermerDefinitivement() {
    try {
      window.localStorage.setItem(cleFermeture(data!.eventId), '1');
    } catch {
      /* stockage indisponible : la fermeture ne vaut que pour cette visite */
    }
    setFerme(true);
  }

  const pourcentage = Math.round((data.faites / data.total) * 100);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label={`Guide de prise en main, ${data.faites} étapes sur ${data.total}`}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-[1.02]"
      >
        {/*
          Un anneau plutôt qu'un simple compteur : l'avancement se lit d'un
          coup d'œil, sans avoir à ouvrir quoi que ce soit.
        */}
        <span
          className="relative flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-primary, #06b6d4) ${pourcentage}%, color-mix(in srgb, currentColor 15%, transparent) 0)`,
          }}
        >
          <span className="absolute inset-[3px] rounded-full bg-card" />
          <Rocket className="relative size-3.5 text-primary" />
        </span>
        Prise en main
        <span className="tabular-nums text-muted-foreground">
          {data.faites}/{data.total}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Rocket className="size-4 text-primary" />
            Prise en main
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={data.eventTitle}>
            {data.eventTitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOuvert(false)}
            aria-label="Réduire le guide"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={fermerDefinitivement}
            aria-label="Ne plus afficher pour cet événement"
            title="Ne plus afficher pour cet événement"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {data.faites} sur {data.total}
          </span>
          <span className="text-muted-foreground">{pourcentage} %</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pourcentage}%` }}
          />
        </div>
      </div>

      <ol className="flex max-h-[min(24rem,50vh)] flex-col gap-1 overflow-y-auto p-3">
        {data.etapes.map((etape) => {
          const l = LIBELLES[etape.cle];
          if (!l) return null;

          return (
            <li key={etape.cle}>
              {/*
                Une étape faite reste LISIBLE mais cesse d'appeler : plus de
                bouton, plus de contraste. Elle sert de repère, pas de tâche.
              */}
              <Link
                href={lienDashboard(l.chemin, evenement)}
                className={`flex items-start gap-3 rounded-xl p-2.5 transition-colors ${
                  etape.faite ? 'opacity-60' : 'hover:bg-secondary'
                }`}
              >
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    etape.faite
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border text-transparent'
                  }`}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${etape.faite ? 'line-through' : ''}`}
                  >
                    {l.titre}
                  </span>
                  {!etape.faite && (
                    <>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{l.aide}</span>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        {l.action}
                        <ChevronRight className="size-3" />
                      </span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {/*
        La dernière étape est aussi la plus lourde de conséquences : publier
        avant d'avoir branché l'encaissement met en ligne une billetterie qui
        ne vend rien. On le dit ici, tant que la case n'est pas cochée.
      */}
      {data.accessMode !== EventAccessMode.RSVP &&
        data.etapes.some((e) => e.cle === 'encaissement' && !e.faite) && (
          <p className="border-t border-border bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            Publiez de préférence <strong>après</strong> avoir branché l’encaissement : sinon votre
            page s’affiche sans que personne puisse acheter.
          </p>
        )}

      <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <PartyPopper className="size-3.5 shrink-0" />
        Ce guide disparaît tout seul une fois les étapes terminées.
      </div>
    </div>
  );
}
