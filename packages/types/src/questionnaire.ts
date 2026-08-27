/**
 * Questionnaire d'inscription — le formulaire que l'organisateur compose
 * lui-même (2026-08-27).
 *
 * Le régime « inscription simple » ne proposait qu'un champ libre unique,
 * nommé par l'organisateur. La note du DTO le disait déjà : « un formulaire
 * entièrement configurable a été écarté — c'est un chantier à part, avec sa
 * validation dynamique, son stockage variable et son export à colonnes
 * changeantes ». Ce fichier EST ce chantier, et il en tient les trois bouts.
 *
 * Il vit dans les types partagés parce que les trois côtés en dépendent et
 * doivent en dépendre à l'identique : l'éditeur de l'organisateur, le
 * formulaire public, et la validation serveur. Une seule définition, une seule
 * fonction de contrôle — un questionnaire validé différemment selon l'endroit
 * accepterait chez l'un ce qu'il refuse chez l'autre.
 */

/**
 * Les types de champ retenus.
 *
 * Volontairement peu nombreux : chacun doit se rendre, se valider, s'exporter
 * en colonne CSV et se lire sur un téléphone. Un « upload de fichier » ou une
 * « grille de choix » demanderaient chacun leur propre stockage et leur propre
 * écran — ils viendront s'ils sont réclamés, pas avant.
 */
export const TypeChamp = {
  /** Réponse courte sur une ligne. */
  TEXTE: 'TEXTE',
  /** Réponse longue, plusieurs lignes. */
  PARAGRAPHE: 'PARAGRAPHE',
  NOMBRE: 'NOMBRE',
  DATE: 'DATE',
  /** Choix unique dans une liste déroulante. */
  LISTE: 'LISTE',
  /** Choix unique, toutes les options visibles. */
  CHOIX_UNIQUE: 'CHOIX_UNIQUE',
  /** Choix multiple : la réponse est un tableau. */
  CHOIX_MULTIPLE: 'CHOIX_MULTIPLE',
  /** Case unique à cocher — consentement, acceptation d'un règlement. */
  CASE_A_COCHER: 'CASE_A_COCHER',
} as const;

export type TypeChamp = (typeof TypeChamp)[keyof typeof TypeChamp];

/** Les types qui exigent une liste d'options. */
export const TYPES_AVEC_OPTIONS: TypeChamp[] = [
  TypeChamp.LISTE,
  TypeChamp.CHOIX_UNIQUE,
  TypeChamp.CHOIX_MULTIPLE,
];

export interface ChampQuestionnaire {
  /**
   * Identifiant STABLE du champ, généré à sa création et jamais réutilisé.
   *
   * C'est lui qui relie une réponse à sa question. Renommer un champ ne doit
   * pas orpheliner les réponses déjà recueillies ; en supprimer un ne doit pas
   * décaler celles des autres.
   */
  id: string;
  type: TypeChamp;
  libelle: string;
  /** Précision affichée sous le libellé — l'équivalent du « texte d'aide ». */
  aide?: string;
  obligatoire: boolean;
  /** Pour LISTE, CHOIX_UNIQUE et CHOIX_MULTIPLE. */
  options?: string[];
}

export interface Questionnaire {
  actif: boolean;
  titre?: string;
  description?: string;
  champs: ChampQuestionnaire[];
}

/**
 * Une réponse, telle qu'elle est STOCKÉE.
 *
 * ⚠️ Le libellé et le type sont figés DANS la réponse, comme `extraLabel`
 * l'était pour le champ libre unique. Relire la question depuis la définition
 * au moment de l'affichage réécrirait le sens de réponses déjà recueillies le
 * jour où l'organisateur reformule sa question — et un sondage dont les
 * questions changent après coup ne vaut rien.
 */
export interface ReponseQuestionnaire {
  champId: string;
  libelle: string;
  type: TypeChamp;
  valeur: string | string[] | number | boolean;
}

/** Plafonds — ce formulaire est public, rien n'empêche d'y déposer un roman. */
export const LIMITES_QUESTIONNAIRE = {
  champs: 30,
  optionsParChamp: 30,
  libelle: 200,
  aide: 300,
  option: 120,
  texte: 500,
  paragraphe: 4000,
} as const;

/** Erreur de validation, adressée à la personne qui remplit le formulaire. */
export interface ErreurReponse {
  champId: string;
  message: string;
}

function estVide(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Valide les réponses brutes contre la définition, et rend les réponses
 * normalisées, prêtes à stocker.
 *
 * Pure et partagée : le formulaire public s'en sert pour prévenir avant
 * l'envoi, le serveur pour refuser. Le serveur reste seul juge — mais tous
 * deux jugent selon la MÊME règle, sinon l'un promet ce que l'autre refuse.
 *
 * Les champs inconnus sont IGNORÉS et non rejetés : entre le moment où un
 * visiteur ouvre la page et celui où il envoie, l'organisateur a pu retirer
 * une question. Perdre cette réponse-là vaut mieux que perdre l'inscription.
 */
export function validerReponses(
  champs: ChampQuestionnaire[],
  brut: Record<string, unknown> | undefined | null,
): { ok: true; reponses: ReponseQuestionnaire[] } | { ok: false; erreurs: ErreurReponse[] } {
  const donnees = brut ?? {};
  const erreurs: ErreurReponse[] = [];
  const reponses: ReponseQuestionnaire[] = [];

  for (const champ of champs.slice(0, LIMITES_QUESTIONNAIRE.champs)) {
    const valeurBrute = donnees[champ.id];

    if (estVide(valeurBrute)) {
      if (champ.obligatoire && champ.type !== TypeChamp.CASE_A_COCHER) {
        erreurs.push({ champId: champ.id, message: `« ${champ.libelle} » est obligatoire.` });
      }
      /*
       * Une case à cocher obligatoire — un consentement — doit être COCHÉE,
       * pas seulement présente. Absente ou fausse, c'est le même refus.
       */
      if (champ.obligatoire && champ.type === TypeChamp.CASE_A_COCHER) {
        erreurs.push({ champId: champ.id, message: `« ${champ.libelle} » doit être coché.` });
      }
      continue;
    }

    const commun = { champId: champ.id, libelle: champ.libelle, type: champ.type };

    switch (champ.type) {
      case TypeChamp.TEXTE:
      case TypeChamp.PARAGRAPHE: {
        const max =
          champ.type === TypeChamp.TEXTE
            ? LIMITES_QUESTIONNAIRE.texte
            : LIMITES_QUESTIONNAIRE.paragraphe;
        const v = String(valeurBrute).trim();
        if (v.length > max) {
          erreurs.push({
            champId: champ.id,
            message: `« ${champ.libelle} » dépasse ${max} caractères.`,
          });
          break;
        }
        reponses.push({ ...commun, valeur: v });
        break;
      }

      case TypeChamp.NOMBRE: {
        const n = Number(valeurBrute);
        if (!Number.isFinite(n)) {
          erreurs.push({ champId: champ.id, message: `« ${champ.libelle} » attend un nombre.` });
          break;
        }
        reponses.push({ ...commun, valeur: n });
        break;
      }

      case TypeChamp.DATE: {
        const v = String(valeurBrute).trim();
        // Format ISO court, celui que rend un `<input type="date">`.
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
          erreurs.push({ champId: champ.id, message: `« ${champ.libelle} » attend une date.` });
          break;
        }
        reponses.push({ ...commun, valeur: v });
        break;
      }

      case TypeChamp.CASE_A_COCHER: {
        const coche = valeurBrute === true || valeurBrute === 'true';
        if (champ.obligatoire && !coche) {
          erreurs.push({ champId: champ.id, message: `« ${champ.libelle} » doit être coché.` });
          break;
        }
        reponses.push({ ...commun, valeur: coche });
        break;
      }

      case TypeChamp.LISTE:
      case TypeChamp.CHOIX_UNIQUE: {
        const v = String(valeurBrute);
        /*
         * La réponse doit figurer PARMI LES OPTIONS. Sans ce contrôle, le
         * formulaire public accepterait n'importe quelle chaîne envoyée à la
         * main, et le dépouillement d'un sondage compterait des réponses que
         * personne n'a jamais proposées.
         */
        if (!(champ.options ?? []).includes(v)) {
          erreurs.push({
            champId: champ.id,
            message: `« ${champ.libelle} » : ce choix n'est pas proposé.`,
          });
          break;
        }
        reponses.push({ ...commun, valeur: v });
        break;
      }

      case TypeChamp.CHOIX_MULTIPLE: {
        const brutes = Array.isArray(valeurBrute) ? valeurBrute : [valeurBrute];
        const valeurs = brutes.map(String);
        const inconnue = valeurs.find((v) => !(champ.options ?? []).includes(v));
        if (inconnue !== undefined) {
          erreurs.push({
            champId: champ.id,
            message: `« ${champ.libelle} » : ce choix n'est pas proposé.`,
          });
          break;
        }
        // Dédoublonnage : deux cases identiques cochées ne font qu'une réponse.
        reponses.push({ ...commun, valeur: [...new Set(valeurs)] });
        break;
      }

      default:
        // Type inconnu : on ignore plutôt que de refuser toute l'inscription.
        break;
    }
  }

  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, reponses };
}

/**
 * Vérifie qu'une DÉFINITION tient debout, avant de l'enregistrer.
 *
 * Séparé de la validation des réponses : ce sont deux publics et deux moments.
 * Ici on parle à l'organisateur, et on peut donc être direct.
 */
export function validerQuestionnaire(q: Questionnaire): string[] {
  const erreurs: string[] = [];

  if (q.champs.length > LIMITES_QUESTIONNAIRE.champs) {
    erreurs.push(`Un questionnaire ne peut pas dépasser ${LIMITES_QUESTIONNAIRE.champs} questions.`);
  }

  const identifiants = new Set<string>();

  q.champs.forEach((champ, i) => {
    const rang = `Question ${i + 1}`;

    if (!champ.id?.trim()) erreurs.push(`${rang} : identifiant manquant.`);
    if (identifiants.has(champ.id)) {
      // Deux champs de même identifiant écraseraient mutuellement leurs
      // réponses : la seconde effacerait la première au stockage.
      erreurs.push(`${rang} : deux questions portent le même identifiant.`);
    }
    identifiants.add(champ.id);

    if (!champ.libelle?.trim()) erreurs.push(`${rang} : le libellé est vide.`);
    if ((champ.libelle ?? '').length > LIMITES_QUESTIONNAIRE.libelle) {
      erreurs.push(`${rang} : libellé trop long (${LIMITES_QUESTIONNAIRE.libelle} caractères max).`);
    }

    if (TYPES_AVEC_OPTIONS.includes(champ.type)) {
      const options = (champ.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        erreurs.push(`${rang} : il faut au moins deux options.`);
      }
      if (options.length > LIMITES_QUESTIONNAIRE.optionsParChamp) {
        erreurs.push(`${rang} : ${LIMITES_QUESTIONNAIRE.optionsParChamp} options au maximum.`);
      }
      if (new Set(options).size !== options.length) {
        erreurs.push(`${rang} : deux options identiques.`);
      }
    }
  });

  return erreurs;
}

/** Rend une réponse lisible dans un tableau ou une colonne CSV. */
export function reponseEnTexte(r: ReponseQuestionnaire): string {
  if (typeof r.valeur === 'boolean') return r.valeur ? 'Oui' : 'Non';
  if (Array.isArray(r.valeur)) return r.valeur.join(' · ');
  return String(r.valeur);
}
