import { describe, it, expect } from 'vitest';
import { soupconsAmPm } from './programme';

const e = (id: string, heure: string, jour = '2026-09-19') => ({ id, startsAt: `${jour}T${heure}` });

describe('soupconsAmPm()', () => {
  /*
   * LE test de ce fichier : le programme réel de MEET DES ELITES 2026, tel
   * qu'il était enregistré le 17 septembre, dans l'ordre de saisie.
   */
  it('retrouve les deux horaires de midi saisis à minuit', () => {
    const programme = [
      e('arrivee', '08:30'),
      e('bienvenue', '09:00'),
      e('panel1', '09:15'),
      e('pause1', '10:45'),
      e('panel2', '10:50'),
      e('faq', '00:00'),
      e('dejeuner', '00:35'),
      e('panel3', '13:35'),
      e('pause2', '14:20'),
      e('panel4', '14:25'),
      e('faq2', '15:00'),
      e('stands', '15:30'),
    ];

    expect(soupconsAmPm(programme)).toEqual([
      { id: 'faq', saisie: '00:00', proposition: '2026-09-19T12:00', propositionHeure: '12:00' },
      { id: 'dejeuner', saisie: '00:35', proposition: '2026-09-19T12:35', propositionHeure: '12:35' },
    ]);
  });

  it('ne signale rien sur un programme en ordre', () => {
    expect(soupconsAmPm([e('a', '08:00'), e('b', '12:00'), e('c', '18:30')])).toEqual([]);
  });

  /*
   * Un programme peut commencer à minuit — une soirée, un réveillon. Seul le
   * recul par rapport à la ligne du dessus est suspect, pas l'heure en soi.
   */
  it('accepte un programme qui commence légitimement à minuit', () => {
    expect(soupconsAmPm([e('a', '00:00'), e('b', '01:30'), e('c', '03:00')])).toEqual([]);
  });

  it('ne compare pas deux journées différentes', () => {
    expect(
      soupconsAmPm([e('j1', '17:00', '2026-09-19'), e('j2', '09:00', '2026-09-20')]),
    ).toEqual([]);
  });

  /*
   * Une entrée simplement mal rangée : 09:00 après 22:00 ne devient pas
   * cohérent à 21:00. Proposer un horaire du soir serait une mauvaise
   * correction.
   */
  it("ne propose rien quand +12 h ne remet pas l'ordre", () => {
    expect(soupconsAmPm([e('a', '22:00'), e('b', '09:00')])).toEqual([]);
  });

  it("ne touche pas une heure de l'après-midi qui recule", () => {
    expect(soupconsAmPm([e('a', '18:00'), e('b', '14:00')])).toEqual([]);
  });

  it('ignore les entrées sans date encore saisie', () => {
    expect(soupconsAmPm([e('a', '10:00'), { id: 'vide', startsAt: '' }, e('c', '11:00')])).toEqual(
      [],
    );
  });
});
