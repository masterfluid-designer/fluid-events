/**
 * Détection des horaires de programme probablement saisis en AM au lieu de PM
 * (2026-09-17).
 *
 * Le 17 septembre, deux jours avant l'événement, la page publique de « MEET
 * DES ELITES 2026 » affichait une foire aux questions à 00:00 et une pause
 * déjeuner à 00:35 — en tête du programme, avant l'arrivée des participants.
 * L'organisateur les avait pourtant saisies au bon endroit, entre le panel de
 * 10:50 et celui de 13:35. Son navigateur présentait le champ horaire en
 * format 12 h, et « 12:00 AM » veut dire minuit.
 *
 * Rien n'était cassé côté code : la donnée enregistrée disait bien minuit, et
 * la page publique, qui trie par heure, l'a fidèlement placée en tête.
 *
 * Le meilleur indice n'est donc pas l'heure seule — un programme peut
 * légitimement commencer à minuit — mais **l'ordre dans lequel l'organisateur
 * a rangé ses entrées**. Une heure qui recule par rapport à la ligne du
 * dessus, et que douze heures de plus remettent exactement à sa place, c'est
 * presque toujours un AM choisi à la place d'un PM.
 */

export interface EntreeHoraire {
  id: string;
  /** Valeur brute d'un champ `datetime-local` : `AAAA-MM-JJTHH:MM`. */
  startsAt: string;
}

export interface SoupconAmPm {
  id: string;
  /** L'heure telle que saisie, `HH:MM`. */
  saisie: string;
  /** La valeur corrigée, prête à remplacer `startsAt`. */
  proposition: string;
  /** L'heure proposée, `HH:MM`. */
  propositionHeure: string;
}

const FORMAT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

function minutes(startsAt: string): { jour: string; total: number } | null {
  const m = FORMAT.exec(startsAt);
  if (!m) return null;
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 23 || min > 59) return null;
  return { jour: m[1], total: h * 60 + min };
}

const deux = (n: number) => String(n).padStart(2, '0');
const enHeure = (total: number) => `${deux(Math.floor(total / 60))}:${deux(total % 60)}`;

/**
 * Parcourt les entrées DANS L'ORDRE DE SAISIE et signale celles dont l'heure
 * recule par rapport à la précédente alors qu'un décalage de douze heures la
 * remettrait en ordre.
 *
 * Trois conditions, toutes nécessaires :
 *  - même journée que l'entrée précédente — on ne compare pas des jours
 *    différents, un programme sur deux jours repart légitimement au matin ;
 *  - une heure du matin (avant midi) — un 14:00 qui recule n'a pas d'AM/PM à
 *    corriger ;
 *  - la version +12 h ne recule plus — sinon l'entrée est simplement mal
 *    rangée, et proposer un horaire du soir serait une mauvaise correction.
 *
 * La comparaison suivante se fait avec l'heure CORRIGÉE : deux erreurs
 * consécutives (00:00 puis 00:35) sont ainsi toutes deux détectées, au lieu
 * que la seconde passe pour cohérente avec la première.
 */
export function soupconsAmPm(entrees: EntreeHoraire[]): SoupconAmPm[] {
  const soupcons: SoupconAmPm[] = [];
  let precedente: { jour: string; total: number } | null = null;

  for (const entree of entrees) {
    const t = minutes(entree.startsAt);
    if (!t) continue;

    let effective = t;

    if (precedente && t.jour === precedente.jour && t.total < precedente.total && t.total < 12 * 60) {
      const corrige = t.total + 12 * 60;
      if (corrige >= precedente.total) {
        soupcons.push({
          id: entree.id,
          saisie: enHeure(t.total),
          proposition: `${t.jour}T${enHeure(corrige)}`,
          propositionHeure: enHeure(corrige),
        });
        effective = { jour: t.jour, total: corrige };
      }
    }

    precedente = effective;
  }

  return soupcons;
}
