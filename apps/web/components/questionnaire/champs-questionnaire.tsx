'use client';

import { TypeChamp, type ChampQuestionnaire } from '@saas-events/types';

/**
 * Rendu des champs d'un questionnaire (2026-08-27).
 *
 * UN SEUL composant pour les deux usages : l'aperçu de l'éditeur et le
 * formulaire public. C'est ce qui garantit que l'organisateur voit exactement
 * ce que verront ses inscrits — un aperçu qui approxime le rendu réel ne sert
 * qu'à donner confiance à tort.
 *
 * `desactive` couvre l'aperçu : les champs se voient, se lisent, mais ne se
 * remplissent pas. Les griser plutôt que les remplacer par des maquettes garde
 * la comparaison honnête.
 */
export type Reponses = Record<string, string | string[] | boolean>;

const classeChamp =
  'w-full rounded-lg border border-stroke bg-white px-3.5 py-2.5 text-sm outline-none focus:border-black disabled:opacity-60 dark:border-strokedark dark:bg-blackho dark:text-white dark:focus:border-manatee';

export function ChampsQuestionnaire({
  champs,
  reponses,
  onChange,
  desactive = false,
}: {
  champs: ChampQuestionnaire[];
  reponses: Reponses;
  onChange: (champId: string, valeur: string | string[] | boolean) => void;
  desactive?: boolean;
}) {
  if (champs.length === 0) return null;

  function bascule(champId: string, option: string, coche: boolean) {
    const actuelles = Array.isArray(reponses[champId]) ? (reponses[champId] as string[]) : [];
    onChange(
      champId,
      coche ? [...actuelles, option] : actuelles.filter((o) => o !== option),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {champs.map((champ) => {
        const valeur = reponses[champ.id];
        const options = (champ.options ?? []).filter((o) => o.trim());

        return (
          <div key={champ.id} className="flex flex-col gap-1.5">
            {/*
              Une case à cocher unique porte son libellé À DROITE de la case :
              le mettre au-dessus, comme pour les autres champs, donnerait
              l'impression d'une question sans réponse proposée.
            */}
            {champ.type !== TypeChamp.CASE_A_COCHER && (
              <label className="text-sm font-medium">
                {champ.libelle || <span className="italic opacity-50">Question sans libellé</span>}
                {champ.obligatoire && <span className="ml-1 text-red-500">*</span>}
              </label>
            )}
            {champ.aide && champ.type !== TypeChamp.CASE_A_COCHER && (
              <span className="-mt-1 text-xs opacity-70">{champ.aide}</span>
            )}

            {champ.type === TypeChamp.TEXTE && (
              <input
                type="text"
                value={(valeur as string) ?? ''}
                onChange={(e) => onChange(champ.id, e.target.value)}
                disabled={desactive}
                required={champ.obligatoire}
                maxLength={500}
                className={classeChamp}
              />
            )}

            {champ.type === TypeChamp.PARAGRAPHE && (
              <textarea
                rows={3}
                value={(valeur as string) ?? ''}
                onChange={(e) => onChange(champ.id, e.target.value)}
                disabled={desactive}
                required={champ.obligatoire}
                maxLength={4000}
                className={classeChamp}
              />
            )}

            {champ.type === TypeChamp.NOMBRE && (
              <input
                type="number"
                value={(valeur as string) ?? ''}
                onChange={(e) => onChange(champ.id, e.target.value)}
                disabled={desactive}
                required={champ.obligatoire}
                className={classeChamp}
              />
            )}

            {champ.type === TypeChamp.DATE && (
              <input
                type="date"
                value={(valeur as string) ?? ''}
                onChange={(e) => onChange(champ.id, e.target.value)}
                disabled={desactive}
                required={champ.obligatoire}
                className={classeChamp}
              />
            )}

            {champ.type === TypeChamp.LISTE && (
              <select
                value={(valeur as string) ?? ''}
                onChange={(e) => onChange(champ.id, e.target.value)}
                disabled={desactive}
                required={champ.obligatoire}
                className={classeChamp}
              >
                <option value="">Choisissez…</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}

            {champ.type === TypeChamp.CHOIX_UNIQUE && (
              <div className="flex flex-col gap-1.5">
                {options.map((o) => (
                  <label key={o} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="radio"
                      name={champ.id}
                      value={o}
                      checked={valeur === o}
                      onChange={() => onChange(champ.id, o)}
                      disabled={desactive}
                      className="size-4 accent-current"
                    />
                    {o}
                  </label>
                ))}
              </div>
            )}

            {champ.type === TypeChamp.CHOIX_MULTIPLE && (
              <div className="flex flex-col gap-1.5">
                {options.map((o) => (
                  <label key={o} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Array.isArray(valeur) && valeur.includes(o)}
                      onChange={(e) => bascule(champ.id, o, e.target.checked)}
                      disabled={desactive}
                      className="size-4 accent-current"
                    />
                    {o}
                  </label>
                ))}
              </div>
            )}

            {champ.type === TypeChamp.CASE_A_COCHER && (
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={valeur === true}
                  onChange={(e) => onChange(champ.id, e.target.checked)}
                  disabled={desactive}
                  className="mt-0.5 size-4 shrink-0 accent-current"
                />
                <span>
                  {champ.libelle || (
                    <span className="italic opacity-50">Question sans libellé</span>
                  )}
                  {champ.obligatoire && <span className="ml-1 text-red-500">*</span>}
                  {champ.aide && <span className="block text-xs opacity-70">{champ.aide}</span>}
                </span>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
