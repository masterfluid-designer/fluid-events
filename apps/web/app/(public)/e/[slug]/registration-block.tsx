'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import { validerReponses, type ChampQuestionnaire } from '@saas-events/types';
import {
  ChampsQuestionnaire,
  type Reponses,
} from '@/components/questionnaire/champs-questionnaire';
import { SectionShell, SectionHeading } from './section-shell';

/**
 * Bloc « Formulaire d'inscription » — régime RSVP (lot 2, 2026-08-22).
 *
 * Deux colonnes : ce que l'organisateur a à dire d'un côté, le formulaire de
 * l'autre. Ni billet, ni paiement, ni compte — on note simplement qui vient.
 *
 * Le formulaire reste visible tant qu'il n'a pas abouti, et laisse place à une
 * confirmation nommée dès qu'il aboutit. Un formulaire qui se vide sans rien
 * dire laisse croire à un échec.
 */
export function RegistrationBlock({
  slug,
  title,
  eyebrow,
  description,
  bullets,
  formTitle,
  formIntro,
  extraLabel,
  questionnaire,
  isPublished,
}: {
  slug: string;
  title?: string;
  eyebrow?: string;
  description?: string;
  bullets?: string[];
  formTitle?: string;
  formIntro?: string;
  /** Champ libre optionnel, nommé par l'organisateur. */
  extraLabel?: string;
  /**
   * Questionnaire composé par l'organisateur (2026-08-27). Absent quand il
   * n'en a pas fait, ou qu'il l'a masqué — le serveur ne l'envoie qu'actif.
   */
  questionnaire?: {
    title?: string | null;
    description?: string | null;
    fields?: ChampQuestionnaire[];
  } | null;
  isPublished: boolean;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [extraValue, setExtraValue] = useState('');
  const [reponses, setReponses] = useState<Reponses>({});
  const [envoi, setEnvoi] = useState(false);
  const [inscrit, setInscrit] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const puces = (bullets ?? []).filter((b) => b.trim());
  const champsQuestionnaire = questionnaire?.fields ?? [];
  const complet = firstName.trim() && lastName.trim() && email.trim();

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    if (!complet || envoi) return;

    /*
     * Le MÊME contrôle que le serveur, joué ici d'abord (2026-08-27) : dire
     * ce qui manque tout de suite vaut mieux qu’un aller-retour réseau pour
     * apprendre qu’une case n’était pas cochée. Le serveur reste seul juge —
     * mais tous deux jugent selon la même règle, sinon l’un promet ce que
     * l’autre refuse.
     */
    const controle = validerReponses(champsQuestionnaire, reponses);
    if (!controle.ok) {
      setErreur(controle.erreurs[0].message);
      return;
    }

    setEnvoi(true);
    setErreur(null);
    try {
      await apiPost(`/api/events/${encodeURIComponent(slug)}/registrations`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        extraLabel: extraLabel?.trim() || undefined,
        extraValue: extraValue.trim() || undefined,
        answers: champsQuestionnaire.length > 0 ? reponses : undefined,
      });
      setInscrit(true);
    } catch (err) {
      /*
       * Le message du serveur est repris tel quel : il distingue « déjà
       * inscrite » d'une vraie panne, et cette différence compte pour la
       * personne devant l'écran.
       */
      setErreur(
        err instanceof ApiError ? err.message : "L'inscription n'a pas abouti — réessayez.",
      );
    } finally {
      setEnvoi(false);
    }
  }

  const champ =
    'rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-blacksection';

  return (
    <SectionShell tone="muted">
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col gap-4">
          <SectionHeading
            eyebrow={eyebrow?.trim() || 'Inscription'}
            title={title || 'Liste des participants'}
          />
          {description && (
            <p className="whitespace-pre-line text-base leading-relaxed text-waterloo dark:text-manatee">
              {description}
            </p>
          )}
          {puces.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {puces.map((puce) => (
                <li key={puce} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  {puce}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          id="inscription"
          className="scroll-mt-20 rounded-2xl border border-stroke bg-white p-6 shadow-solid-2 dark:border-strokedark dark:bg-blacksection md:p-7"
        >
          {inscrit ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="size-10 text-primary" />
              <h3 className="font-event text-lg">Vous êtes sur la liste</h3>
              <p className="text-sm text-waterloo dark:text-manatee">
                Votre nom sera à l’accueil le soir même. Un email de confirmation vient de vous
                être envoyé.
              </p>
            </div>
          ) : (
            <form onSubmit={soumettre} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <h3 className="font-event text-lg leading-tight">{formTitle || 'Je m’inscris'}</h3>
                {formIntro && (
                  <p className="text-sm leading-relaxed text-waterloo dark:text-manatee">
                    {formIntro}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-waterloo dark:text-manatee">
                  Prénom
                  <input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    placeholder="Ama"
                    className={`${champ} font-normal normal-case tracking-normal text-black dark:text-white`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-waterloo dark:text-manatee">
                  Nom
                  <input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    placeholder="Dzikpé"
                    className={`${champ} font-normal normal-case tracking-normal text-black dark:text-white`}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-waterloo dark:text-manatee">
                  Téléphone
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="+228 90 00 00 00"
                    className={`${champ} font-normal normal-case tracking-normal text-black dark:text-white`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-waterloo dark:text-manatee">
                  Email
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                    className={`${champ} font-normal normal-case tracking-normal text-black dark:text-white`}
                  />
                </label>
              </div>

              {extraLabel?.trim() && (
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-waterloo dark:text-manatee">
                  {extraLabel}
                  <input
                    value={extraValue}
                    onChange={(e) => setExtraValue(e.target.value)}
                    className={`${champ} font-normal normal-case tracking-normal text-black dark:text-white`}
                  />
                </label>
              )}

              {/*
                Les questions de l'organisateur, sous les champs d'identité
                (2026-08-27). Le MÊME composant de rendu que son aperçu :
                il voit exactement ce que voit l'inscrit.
              */}
              {champsQuestionnaire.length > 0 && (
                <div className="flex flex-col gap-4 border-t border-stroke pt-5 dark:border-strokedark">
                  {questionnaire?.title && (
                    <h4 className="font-event text-base">{questionnaire.title}</h4>
                  )}
                  {questionnaire?.description && (
                    <p className="-mt-2 text-sm text-waterloo dark:text-manatee">
                      {questionnaire.description}
                    </p>
                  )}
                  <ChampsQuestionnaire
                    champs={champsQuestionnaire}
                    reponses={reponses}
                    onChange={(id, v) => setReponses((r) => ({ ...r, [id]: v }))}
                  />
                </div>
              )}

              {erreur && (
                <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{erreur}</p>
              )}

              <button
                type="submit"
                disabled={!complet || envoi || !isPublished}
                className="btn-accent inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {envoi && <Loader2 className="size-4 animate-spin" />}
                {isPublished ? 'Valider mon inscription' : 'Inscriptions bientôt ouvertes'}
              </button>

              <p className="text-center text-xs text-waterloo dark:text-manatee">
                Vos informations servent uniquement à l’organisation de la soirée.
              </p>
            </form>
          )}
        </div>
      </div>
    </SectionShell>
  );
}
