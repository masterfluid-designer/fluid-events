/**
 * Tests — validation du questionnaire d'inscription (2026-08-27).
 *
 * Cette fonction est jouée DEUX FOIS : par le formulaire public avant l'envoi,
 * et par le serveur avant l'écriture. Elle est donc la seule chose qui garantit
 * que l'un ne promet pas ce que l'autre refuse — et le serveur reste seul juge.
 */
import { describe, it, expect } from 'vitest';
import {
  TypeChamp,
  validerReponses,
  validerQuestionnaire,
  reponseEnTexte,
  type ChampQuestionnaire,
} from './questionnaire';

const liste: ChampQuestionnaire = {
  id: 'age',
  type: TypeChamp.LISTE,
  libelle: 'Tranche d’âge',
  obligatoire: true,
  options: ['moins de 25 ans', '25 à 40 ans'],
};

const multiple: ChampQuestionnaire = {
  id: 'themes',
  type: TypeChamp.CHOIX_MULTIPLE,
  libelle: 'Thèmes',
  obligatoire: false,
  options: ['Vidéo', 'Réseaux', 'Gestion'],
};

const consentement: ChampQuestionnaire = {
  id: 'charte',
  type: TypeChamp.CASE_A_COCHER,
  libelle: 'J’accepte le règlement',
  obligatoire: true,
};

describe('validerReponses()', () => {
  it('accepte une réponse conforme et fige libellé et type', () => {
    const r = validerReponses([liste], { age: '25 à 40 ans' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reponses[0]).toEqual({
      champId: 'age',
      libelle: 'Tranche d’âge',
      type: TypeChamp.LISTE,
      valeur: '25 à 40 ans',
    });
  });

  it('refuse une question obligatoire laissée vide', () => {
    const r = validerReponses([liste], {});

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreurs[0].message).toContain('obligatoire');
  });

  /*
   * LE contrôle du sondage. Sans lui, une requête forgée à la main ferait
   * compter des réponses que personne n'a jamais proposées, et le
   * dépouillement mentirait.
   */
  it('refuse un choix qui ne figure pas parmi les options', () => {
    const r = validerReponses([liste], { age: 'centenaire' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreurs[0].message).toContain("n'est pas proposé");
  });

  it('refuse un choix multiple contenant une option inconnue', () => {
    const r = validerReponses([multiple], { themes: ['Vidéo', 'Astrologie'] });

    expect(r.ok).toBe(false);
  });

  it('dédoublonne un choix multiple', () => {
    const r = validerReponses([multiple], { themes: ['Vidéo', 'Vidéo', 'Gestion'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reponses[0].valeur).toEqual(['Vidéo', 'Gestion']);
  });

  it('accepte une valeur unique là où un tableau est attendu', () => {
    const r = validerReponses([multiple], { themes: 'Réseaux' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reponses[0].valeur).toEqual(['Réseaux']);
  });

  /* Un consentement doit être COCHÉ, pas seulement présent. */
  it('refuse un consentement obligatoire décoché', () => {
    for (const valeur of [false, undefined]) {
      const r = validerReponses([consentement], { charte: valeur });
      expect(r.ok, String(valeur)).toBe(false);
    }
  });

  it('accepte un consentement coché, y compris en chaîne', () => {
    expect(validerReponses([consentement], { charte: true }).ok).toBe(true);
    expect(validerReponses([consentement], { charte: 'true' }).ok).toBe(true);
  });

  /*
   * Entre le moment où un visiteur ouvre la page et celui où il envoie,
   * l'organisateur a pu retirer une question. Perdre cette réponse-là vaut
   * mieux que perdre l'inscription.
   */
  it('ignore une réponse à une question inconnue plutôt que de tout refuser', () => {
    const r = validerReponses([liste], { age: '25 à 40 ans', supprimee: 'peu importe' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reponses).toHaveLength(1);
  });

  it('refuse un nombre qui n’en est pas un', () => {
    const champ: ChampQuestionnaire = {
      id: 'n', type: TypeChamp.NOMBRE, libelle: 'Effectif', obligatoire: false,
    };
    expect(validerReponses([champ], { n: 'douze' }).ok).toBe(false);
    expect(validerReponses([champ], { n: '12' }).ok).toBe(true);
  });

  it('refuse une date mal formée', () => {
    const champ: ChampQuestionnaire = {
      id: 'd', type: TypeChamp.DATE, libelle: 'Naissance', obligatoire: false,
    };
    expect(validerReponses([champ], { d: '12/03/1990' }).ok).toBe(false);
    expect(validerReponses([champ], { d: '1990-03-12' }).ok).toBe(true);
  });

  it('refuse un texte au-delà du plafond', () => {
    const champ: ChampQuestionnaire = {
      id: 't', type: TypeChamp.TEXTE, libelle: 'Commune', obligatoire: false,
    };
    expect(validerReponses([champ], { t: 'x'.repeat(501) }).ok).toBe(false);
    expect(validerReponses([champ], { t: 'x'.repeat(500) }).ok).toBe(true);
  });

  it('supporte l’absence totale de réponses', () => {
    expect(validerReponses([], undefined).ok).toBe(true);
    expect(validerReponses([], null).ok).toBe(true);
  });
});

describe('validerQuestionnaire()', () => {
  it('accepte un questionnaire bien formé', () => {
    expect(validerQuestionnaire({ actif: true, champs: [liste, consentement] })).toEqual([]);
  });

  it('exige au moins deux options sur un choix', () => {
    const erreurs = validerQuestionnaire({
      actif: true,
      champs: [{ ...liste, options: ['seule'] }],
    });
    expect(erreurs[0]).toContain('deux options');
  });

  /*
   * Deux champs de même identifiant écraseraient mutuellement leurs réponses :
   * la seconde effacerait la première au stockage.
   */
  it('refuse deux questions de même identifiant', () => {
    const erreurs = validerQuestionnaire({ actif: true, champs: [liste, { ...liste }] });
    expect(erreurs.some((e) => e.includes('même identifiant'))).toBe(true);
  });

  it('refuse un libellé vide', () => {
    const erreurs = validerQuestionnaire({
      actif: true,
      champs: [{ ...liste, libelle: '   ' }],
    });
    expect(erreurs.some((e) => e.includes('libellé est vide'))).toBe(true);
  });

  it('refuse deux options identiques', () => {
    const erreurs = validerQuestionnaire({
      actif: true,
      champs: [{ ...liste, options: ['a', 'a'] }],
    });
    expect(erreurs.some((e) => e.includes('identiques'))).toBe(true);
  });
});

describe('reponseEnTexte()', () => {
  it('rend chaque forme de valeur lisible en colonne CSV', () => {
    expect(reponseEnTexte({ champId: 'a', libelle: 'A', type: TypeChamp.CASE_A_COCHER, valeur: true })).toBe('Oui');
    expect(reponseEnTexte({ champId: 'a', libelle: 'A', type: TypeChamp.CASE_A_COCHER, valeur: false })).toBe('Non');
    expect(
      reponseEnTexte({ champId: 'b', libelle: 'B', type: TypeChamp.CHOIX_MULTIPLE, valeur: ['x', 'y'] }),
    ).toBe('x · y');
    expect(reponseEnTexte({ champId: 'c', libelle: 'C', type: TypeChamp.NOMBRE, valeur: 12 })).toBe('12');
  });
});
