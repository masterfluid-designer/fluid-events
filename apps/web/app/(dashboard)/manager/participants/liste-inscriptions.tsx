'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
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
}

export function ListeInscriptions({ evenement }: { evenement?: string }) {
  const [recherche, setRecherche] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['manager-inscriptions', evenement],
    queryFn: () => api<{ total: number; items: Inscription[] }>(
      avecEvenement('/api/registrations', evenement),
    ),
  });

  const inscriptions = data?.items ?? [];

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return inscriptions;
    return inscriptions.filter((i) =>
      [i.firstName, i.lastName, i.email, i.phone ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [inscriptions, recherche]);

  /**
   * L'export porte sur ce qui est AFFICHÉ, filtre compris : l'organisateur qui
   * a cherché « Kossi » et exporte s'attend aux lignes qu'il a sous les yeux,
   * pas à la liste entière.
   */
  function exporterCsv() {
    const colonneLibre = inscriptions.find((i) => i.extraLabel)?.extraLabel ?? null;
    const entete = ['Prénom', 'Nom', 'Email', 'Téléphone', 'Inscrit le'];
    if (colonneLibre) entete.push(colonneLibre);

    const lignes = filtrees.map((i) => {
      const ligne = [
        i.firstName,
        i.lastName,
        i.email,
        i.phone ?? '',
        new Date(i.createdAt).toLocaleString('fr-FR'),
      ];
      if (colonneLibre) ligne.push(i.extraValue ?? '');
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
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} personne{(data?.total ?? 0) > 1 ? 's' : ''} sur la liste
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
                  <td className="px-4 py-3 text-muted-foreground">{i.extraValue ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
