'use client';

import { useEffect, useState } from 'react';
import { reponseEnTexte, type ReponseQuestionnaire } from '@saas-events/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, Users, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api, apiPatch, apiDelete, ApiError } from '@/lib/api';
import { avecEvenement } from '@/lib/evenement-actif';

/**
 * Liste des inscrits — régime « inscription simple » (lot 2, 2026-08-22).
 *
 * Un événement sur inscription n'a ni commande ni billet : la page
 * Participants, bâtie sur les commandes payées, y resterait vide à jamais.
 * C'est cette liste qui la remplace, avec le même export CSV.
 */
interface Inscription {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  extraLabel: string | null;
  extraValue: string | null;
  createdAt: string;
  checkedInAt: string | null;
  /** Réponses au questionnaire, libellé et type figés (2026-08-27). */
  answers?: ReponseQuestionnaire[] | null;
}

const PAR_PAGE = 50;

export function ListeInscriptions({ evenement }: { evenement?: string }) {
  const [recherche, setRecherche] = useState('');
  const [limite, setLimite] = useState(PAR_PAGE);
  const queryClient = useQueryClient();

  /*
   * La recherche part au SERVEUR depuis le 2026-08-23.
   *
   * Elle filtrait la page chargée, c'est-à-dire cinquante lignes sur trois
   * cents : chercher quelqu’un inscrit en deux-centième position ne
   * renvoyait rien, et l’organisateur en concluait que la personne ne
   * s’était pas inscrite. Un filtre qui ment est pire que pas de filtre.
   *
   * Retardée d'un quart de seconde : sans cela, « Konaté » lance six
   * requêtes dont cinq déjà périmées en arrivant.
   */
  const [termeEnvoye, setTermeEnvoye] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermeEnvoye(recherche.trim()), 250);
    return () => clearTimeout(t);
  }, [recherche]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['manager-inscriptions', evenement, limite, termeEnvoye],
    queryFn: () => {
      const base = avecEvenement('/api/registrations', evenement);
      const separateur = base.includes('?') ? '&' : '?';
      const q = termeEnvoye ? `&q=${encodeURIComponent(termeEnvoye)}` : '';
      return api<{ total: number; presents: number; items: Inscription[] }>(
        `${base}${separateur}limit=${limite}${q}`,
      );
    },
    // La liste précédente reste affichée pendant la frappe : la faire
    // clignoter à chaque lettre est illisible.
    placeholderData: (precedent) => precedent,
  });

  const inscriptions = data?.items ?? [];

  function rafraichir() {
    void queryClient.invalidateQueries({ queryKey: ['manager-inscriptions'] });
  }

  const pointer = useMutation({
    mutationFn: ({ id, present }: { id: string; present: boolean }) =>
      apiPatch(`/api/registrations/${id}/check-in`, { present }),
    onSuccess: rafraichir,
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Le pointage n’a pas été enregistré.'),
  });

  const retirer = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/registrations/${id}`),
    onSuccess: () => {
      toast.success('Inscription retirée');
      rafraichir();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Le retrait n’a pas abouti.'),
  });

  // Le filtrage a lieu en base : ce que le serveur renvoie EST le résultat.
  const filtrees = inscriptions;

  /**
   * L'export porte sur ce qui est AFFICHÉ, filtre compris : l'organisateur qui
   * a cherché « Kossi » et exporte s'attend aux lignes qu'il a sous les yeux,
   * pas à la liste entière.
   */
  function exporterCsv() {
    const colonneLibre = inscriptions.find((i) => i.extraLabel)?.extraLabel ?? null;
    const entete = ['Prénom', 'Nom', 'Email', 'Téléphone', 'Inscrit le', 'Présent'];
    if (colonneLibre) entete.push(colonneLibre);

    /*
     * Les colonnes du questionnaire (2026-08-27).
     *
     * Elles se déduisent des RÉPONSES, pas de la définition courante : une
     * question retirée depuis laisserait sinon ses réponses hors du fichier,
     * et un export qui perd des données en route ne vaut rien. L'ordre
     * suit la première apparition, ce qui reproduit celui du formulaire.
     */
    const colonnes: Array<{ champId: string; libelle: string }> = [];
    for (const inscrit of filtrees) {
      for (const r of inscrit.answers ?? []) {
        if (!colonnes.some((c) => c.champId === r.champId)) {
          colonnes.push({ champId: r.champId, libelle: r.libelle });
        }
      }
    }
    entete.push(...colonnes.map((c) => c.libelle));

    const lignes = filtrees.map((i) => {
      const ligne = [
        i.firstName,
        i.lastName,
        i.email,
        i.phone ?? '',
        new Date(i.createdAt).toLocaleString('fr-FR'),
        i.checkedInAt ? new Date(i.checkedInAt).toLocaleString('fr-FR') : '',
      ];
      if (colonneLibre) ligne.push(i.extraValue ?? '');
      for (const colonne of colonnes) {
        const r = (i.answers ?? []).find((a) => a.champId === colonne.champId);
        ligne.push(r ? reponseEnTexte(r) : '');
      }
      return ligne;
    });

    const csv = [entete, ...lignes]
      .map((ligne) => ligne.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Le BOM : sans lui, Excel affiche « Dzikpé » comme « DzikpÃ© ».
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'inscriptions.csv';
    lien.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        La liste des inscrits n’a pas pu être chargée. Rechargez la page.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inscrits</h1>
          {/*
            Le compte porte sur ce que le SERVEUR a filtré. Pendant une
            recherche, « 1 personne sur la liste » se lirait comme un total —
            on dit donc « résultat », qui ne prétend rien sur le reste.
          */}
          <p className="text-sm text-muted-foreground">
            {termeEnvoye ? (
              <>
                {data?.total ?? 0} résultat{(data?.total ?? 0) > 1 ? 's' : ''} pour « 
                {termeEnvoye} »
              </>
            ) : (
              <>
                {data?.total ?? 0} personne{(data?.total ?? 0) > 1 ? 's' : ''} sur la liste
                {(data?.presents ?? 0) > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-foreground">
                      {data?.presents} arrivée{(data?.presents ?? 0) > 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={exporterCsv} disabled={filtrees.length === 0}>
          Exporter CSV
        </Button>
      </div>

      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border px-3.5 py-2.5 text-sm">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un inscrit…"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {filtrees.length === 0 ? (
        /* L'état vide est nommé, et distingue « personne encore » de « rien
           ne correspond » — les deux appellent des gestes différents. */
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {inscriptions.length === 0
              ? 'Personne ne s’est encore inscrit. Partagez le lien de votre page publique.'
              : 'Aucun inscrit ne correspond à cette recherche.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Nom</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Inscrit le</th>
                <th className="px-4 py-3 font-semibold">Réponse</th>
                <th className="px-4 py-3 text-right font-semibold">Entrée</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">
                    {i.firstName} {i.lastName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{i.email}</div>
                    {i.phone && <div className="text-xs">{i.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(i.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {i.extraValue && <div>{i.extraValue}</div>}
                    {(i.answers ?? []).length > 0 ? (
                      <dl className="flex flex-col gap-1">
                        {(i.answers ?? []).map((r) => (
                          <div key={r.champId} className="text-xs">
                            <dt className="inline font-medium text-foreground">{r.libelle} : </dt>
                            <dd className="inline">{reponseEnTexte(r)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : !i.extraValue ? (
                      '—'
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {/*
                        Le pointage est une BASCULE, pas une action définitive :
                        on se trompe de ligne sur un téléphone, debout, dans le
                        bruit. Un bouton large, atteignable au pouce.
                      */}
                      <button
                        type="button"
                        onClick={() =>
                          pointer.mutate({ id: i.id, present: !i.checkedInAt })
                        }
                        disabled={pointer.isPending}
                        aria-pressed={Boolean(i.checkedInAt)}
                        title={
                          i.checkedInAt
                            ? `Arrivé·e à ${new Date(i.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — cliquer pour annuler`
                            : 'Marquer comme arrivé·e'
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          i.checkedInAt
                            ? 'bg-primary text-white'
                            : 'border border-border hover:bg-accent'
                        }`}
                      >
                        <Check className="size-3.5" />
                        {i.checkedInAt
                          ? new Date(i.checkedInAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Arrivé·e'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          // Une suppression nominative se confirme : la ligne
                          // ne se récupère pas, et le geste est voisin du
                          // pointage.
                          if (
                            window.confirm(
                              `Retirer ${i.firstName} ${i.lastName} de la liste ? Cette inscription sera supprimée.`,
                            )
                          ) {
                            retirer.mutate(i.id);
                          }
                        }}
                        disabled={retirer.isPending}
                        title="Retirer de la liste"
                        className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Une soirée à huit cents inscrits ne se charge pas d’un coup sur le
          téléphone de l’accueil, la veille, en 3G. */}
      {inscriptions.length < (data?.total ?? 0) && (
        <Button variant="outline" onClick={() => setLimite((l) => l + PAR_PAGE)}>
          Afficher plus ({inscriptions.length} sur {data?.total})
        </Button>
      )}
    </div>
  );
}
