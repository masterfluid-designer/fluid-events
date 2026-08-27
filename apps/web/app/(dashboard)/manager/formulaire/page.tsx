'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Eye, ClipboardList,
  AlertTriangle, Copy,
} from 'lucide-react';
import {
  TypeChamp, TYPES_AVEC_OPTIONS, LIMITES_QUESTIONNAIRE, validerQuestionnaire,
  type ChampQuestionnaire, type Questionnaire,
} from '@saas-events/types';
import { api, ApiError } from '@/lib/api';
import { avecEvenement, useEvenementActif } from '@/lib/evenement-actif';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ApercuQuestionnaire } from './apercu';

/**
 * Éditeur de questionnaire d'inscription (2026-08-27).
 *
 * Le régime « inscription simple » ne recueillait qu'un nom, un email, un
 * téléphone et un champ libre. Une ONG qui veut connaître la tranche d'âge, la
 * commune et les disponibilités de ses participants n'avait aucun moyen de le
 * demander — et un sondeur encore moins.
 *
 * Trois partis pris tiennent cet écran :
 *
 *  - **L'aperçu est à côté, pas derrière un bouton.** On compose un formulaire
 *    en le voyant ; un aperçu qu'il faut aller chercher n'est jamais consulté,
 *    et les questions mal tournées partent en production.
 *  - **Les identifiants de champ sont invisibles et immuables.** Ils relient
 *    une réponse à sa question : les exposer inviterait à les changer, et
 *    changer un identifiant orphelinerait toutes les réponses déjà données.
 *  - **Rien ne s'enregistre en continu.** Un questionnaire à demi remanié qui
 *    partirait tout seul en ligne serait pire qu'un brouillon : les visiteurs
 *    répondraient à des questions en cours d'écriture.
 */
const ETIQUETTES: Record<TypeChamp, { nom: string; aide: string }> = {
  [TypeChamp.TEXTE]: { nom: 'Réponse courte', aide: 'Une ligne — un nom, une ville.' },
  [TypeChamp.PARAGRAPHE]: { nom: 'Paragraphe', aide: 'Plusieurs lignes — une motivation.' },
  [TypeChamp.NOMBRE]: { nom: 'Nombre', aide: 'Un âge, un effectif.' },
  [TypeChamp.DATE]: { nom: 'Date', aide: 'Un jour au calendrier.' },
  [TypeChamp.LISTE]: { nom: 'Liste déroulante', aide: 'Un choix parmi plusieurs, replié.' },
  [TypeChamp.CHOIX_UNIQUE]: { nom: 'Choix unique', aide: 'Un choix, toutes les options visibles.' },
  [TypeChamp.CHOIX_MULTIPLE]: { nom: 'Choix multiple', aide: 'Plusieurs réponses possibles.' },
  [TypeChamp.CASE_A_COCHER]: { nom: 'Case à cocher', aide: 'Un consentement, un règlement.' },
};

/** Identifiant stable, jamais réutilisé — voir le commentaire d'en-tête. */
function nouvelId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const VIDE: Questionnaire = { actif: false, titre: '', description: '', champs: [] };

export default function PageQuestionnaire() {
  const evenement = useEvenementActif();
  const queryClient = useQueryClient();

  const [brouillon, setBrouillon] = useState<Questionnaire>(VIDE);
  const [charge, setCharge] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['questionnaire', evenement],
    queryFn: () => api<Questionnaire>(avecEvenement('/api/registrations/form', evenement)),
  });

  // Le brouillon part de ce qui est enregistré, une seule fois : le recharger
  // à chaque réponse du serveur effacerait le travail en cours.
  useEffect(() => {
    if (data && !charge) {
      setBrouillon({ ...VIDE, ...data });
      setCharge(true);
    }
  }, [data, charge]);

  const enregistrer = useMutation({
    mutationFn: (q: Questionnaire) =>
      api<Questionnaire>(avecEvenement('/api/registrations/form', evenement), {
        method: 'PUT',
        body: JSON.stringify(q),
      }),
    onSuccess: () => {
      toast.success('Questionnaire enregistré');
      void queryClient.invalidateQueries({ queryKey: ['questionnaire'] });
      void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Enregistrement impossible.'),
  });

  function modifier(index: number, patch: Partial<ChampQuestionnaire>) {
    setBrouillon((q) => ({
      ...q,
      champs: q.champs.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function ajouter(type: TypeChamp) {
    setBrouillon((q) => ({
      ...q,
      champs: [
        ...q.champs,
        {
          id: nouvelId(),
          type,
          libelle: '',
          obligatoire: false,
          // Deux options d'emblée : le minimum exigé, et une liste à une seule
          // entrée n'est pas un choix.
          options: TYPES_AVEC_OPTIONS.includes(type) ? ['', ''] : undefined,
        },
      ],
    }));
  }

  function supprimer(index: number) {
    setBrouillon((q) => ({ ...q, champs: q.champs.filter((_, i) => i !== index) }));
  }

  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    setBrouillon((q) => {
      if (cible < 0 || cible >= q.champs.length) return q;
      const champs = [...q.champs];
      [champs[index], champs[cible]] = [champs[cible], champs[index]];
      return { ...q, champs };
    });
  }

  function dupliquer(index: number) {
    setBrouillon((q) => {
      const champs = [...q.champs];
      // Un identifiant NEUF : le copier ferait écraser mutuellement les
      // réponses des deux questions.
      champs.splice(index + 1, 0, { ...champs[index], id: nouvelId() });
      return { ...q, champs };
    });
  }

  const erreurs = validerQuestionnaire(brouillon);
  const plein = brouillon.champs.length >= LIMITES_QUESTIONNAIRE.champs;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Impossible de charger votre questionnaire. Rechargez la page.
      </p>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="size-5 text-muted-foreground" />
            Questionnaire d’inscription
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ajoutez vos propres questions au formulaire d’inscription : listes, cases à cocher,
            choix multiples. Les réponses sont rattachées à chaque inscrit et exportables.
          </p>
        </div>
        <Button
          onClick={() => enregistrer.mutate(brouillon)}
          disabled={erreurs.length > 0 || enregistrer.isPending}
        >
          {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {erreurs.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>À corriger avant d’enregistrer :</strong>
            <ul className="mt-1 list-disc pl-5">
              {erreurs.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={brouillon.actif}
                onChange={(e) => setBrouillon((q) => ({ ...q, actif: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                <span className="font-medium">Afficher ce questionnaire aux inscrits</span>
                <span className="block text-xs text-muted-foreground">
                  Décoché, il reste ici avec ses réponses déjà recueillies — rien n’est perdu.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold">Titre (facultatif)</span>
                <Input
                  value={brouillon.titre ?? ''}
                  onChange={(e) => setBrouillon((q) => ({ ...q, titre: e.target.value }))}
                  placeholder="Mieux vous connaître"
                  className="mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold">Introduction (facultatif)</span>
                <Input
                  value={brouillon.description ?? ''}
                  onChange={(e) => setBrouillon((q) => ({ ...q, description: e.target.value }))}
                  placeholder="Trois questions pour adapter le programme."
                  className="mt-1.5"
                />
              </label>
            </div>
          </Card>

          {brouillon.champs.map((champ, index) => (
            <Card key={champ.id} className="space-y-3 p-4">
              <div className="flex items-start gap-2">
                <GripVertical className="mt-2 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Question {index + 1}</Badge>
                    <select
                      value={champ.type}
                      onChange={(e) => {
                        const type = e.target.value as TypeChamp;
                        modifier(index, {
                          type,
                          options: TYPES_AVEC_OPTIONS.includes(type)
                            ? (champ.options?.length ? champ.options : ['', ''])
                            : undefined,
                        });
                      }}
                      className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
                    >
                      {Object.values(TypeChamp).map((t) => (
                        <option key={t} value={t}>
                          {ETIQUETTES[t].nom}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      {ETIQUETTES[champ.type].aide}
                    </span>
                  </div>

                  <Input
                    value={champ.libelle}
                    onChange={(e) => modifier(index, { libelle: e.target.value })}
                    placeholder="Votre question"
                    maxLength={LIMITES_QUESTIONNAIRE.libelle}
                  />
                  <Input
                    value={champ.aide ?? ''}
                    onChange={(e) => modifier(index, { aide: e.target.value })}
                    placeholder="Précision affichée sous la question (facultatif)"
                    maxLength={LIMITES_QUESTIONNAIRE.aide}
                    className="text-xs"
                  />

                  {TYPES_AVEC_OPTIONS.includes(champ.type) && (
                    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                      <span className="text-xs font-semibold">Options proposées</span>
                      {(champ.options ?? []).map((option, io) => (
                        <div key={io} className="flex items-center gap-2">
                          <Input
                            value={option}
                            onChange={(e) =>
                              modifier(index, {
                                options: (champ.options ?? []).map((o, k) =>
                                  k === io ? e.target.value : o,
                                ),
                              })
                            }
                            placeholder={`Option ${io + 1}`}
                            maxLength={LIMITES_QUESTIONNAIRE.option}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Retirer cette option"
                            disabled={(champ.options ?? []).length <= 2}
                            onClick={() =>
                              modifier(index, {
                                options: (champ.options ?? []).filter((_, k) => k !== io),
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          (champ.options ?? []).length >= LIMITES_QUESTIONNAIRE.optionsParChamp
                        }
                        onClick={() =>
                          modifier(index, { options: [...(champ.options ?? []), ''] })
                        }
                      >
                        <Plus className="size-3.5" />
                        Ajouter une option
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={champ.obligatoire}
                        onChange={(e) => modifier(index, { obligatoire: e.target.checked })}
                        className="size-3.5 accent-primary"
                      />
                      Obligatoire
                    </label>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" aria-label="Monter"
                        disabled={index === 0} onClick={() => deplacer(index, -1)}>
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Descendre"
                        disabled={index === brouillon.champs.length - 1}
                        onClick={() => deplacer(index, 1)}>
                        <ChevronDown className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Dupliquer"
                        onClick={() => dupliquer(index)}>
                        <Copy className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Supprimer"
                        className="text-destructive" onClick={() => supprimer(index)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          <Card className="p-4">
            <span className="text-xs font-semibold">Ajouter une question</span>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {Object.values(TypeChamp).map((t) => (
                <Button key={t} variant="outline" size="sm" disabled={plein} onClick={() => ajouter(t)}>
                  <Plus className="size-3.5" />
                  {ETIQUETTES[t].nom}
                </Button>
              ))}
            </div>
            {plein && (
              <p className="mt-2 text-xs text-muted-foreground">
                {LIMITES_QUESTIONNAIRE.champs} questions au maximum — au-delà, plus personne ne
                répond jusqu’au bout.
              </p>
            )}
          </Card>
        </div>

        {/* L'aperçu est À CÔTÉ, jamais derrière un bouton — voir l'en-tête. */}
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="size-4 text-muted-foreground" />
              Ce que verront vos inscrits
            </h2>
            <div className="mt-4">
              <ApercuQuestionnaire questionnaire={brouillon} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
