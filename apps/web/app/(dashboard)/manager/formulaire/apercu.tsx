'use client';

import { useState } from 'react';
import type { Questionnaire } from '@saas-events/types';
import { ChampsQuestionnaire, type Reponses } from '@/components/questionnaire/champs-questionnaire';

/**
 * Aperçu du questionnaire, dans l'éditeur (2026-08-27).
 *
 * Il emprunte LE MÊME composant de rendu que le formulaire public : un aperçu
 * qui approxime le rendu réel ne sert qu'à donner confiance à tort. Seule
 * différence, les champs sont inertes — on regarde, on ne remplit pas.
 *
 * L'état local des réponses n'existe que pour que les cases se cochent
 * visuellement si quelqu'un essaie : rien n'en sort.
 */
export function ApercuQuestionnaire({ questionnaire }: { questionnaire: Questionnaire }) {
  const [reponses, setReponses] = useState<Reponses>({});

  const champs = questionnaire.champs;

  if (champs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Ajoutez une question : elle apparaîtra ici, telle que vos inscrits la verront.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4">
      {!questionnaire.actif && (
        <p className="mb-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          Questionnaire masqué : cochez « Afficher ce questionnaire » pour le mettre en ligne.
        </p>
      )}
      {questionnaire.titre && <h3 className="text-sm font-bold">{questionnaire.titre}</h3>}
      {questionnaire.description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{questionnaire.description}</p>
      )}
      <div className="mt-4">
        <ChampsQuestionnaire
          champs={champs}
          reponses={reponses}
          onChange={(id, v) => setReponses((r) => ({ ...r, [id]: v }))}
          desactive
        />
      </div>
    </div>
  );
}
