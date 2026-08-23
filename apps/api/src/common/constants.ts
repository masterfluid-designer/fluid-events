/**
 * Constantes globales partagées.
 * Lecture de process.env ici (ConfigModule est global et a déjà chargé le .env).
 */

/** URL du frontend — utilisée pour les redirections OAuth et le CORS. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/** URL publique de l'API — utilisée pour les notify_url/callback_url CinetPay/FedaPay. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * URL publique de l'application — ce que les emails donnent à cliquer.
 *
 * Distincte de FRONTEND_URL par héritage ; en production les deux valent la
 * même chose (`docker-compose.prod.yml` les alimente depuis `APP_URL`).
 */
export const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

/**
 * Refuse de démarrer en production si les URLs publiques n'ont pas été fixées
 * (2026-08-23).
 *
 * Le repli `localhost` est indispensable en développement, et silencieux en
 * production : une invitation partirait avec « Tableau de bord :
 * http://localhost:3000/manager », un lien qui ne mène nulle part chez le
 * destinataire, et rien dans les logs ne l'aurait signalé. Pire avec un
 * `APP_URL=` vide dans le `.env` : `??` ne rattrape pas la chaîne vide, et les
 * liens deviennent relatifs — donc morts dans un client mail.
 *
 * Même parti pris que `GOOGLE_CLIENT_ID` : mieux vaut un démarrage refusé,
 * visible tout de suite, que des emails partis pour de bon vers nulle part.
 */
export function verifierUrlsPubliques(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const attendues: Array<[string, string | undefined]> = [
    ['APP_URL', process.env.APP_URL],
    ['FRONTEND_URL', process.env.FRONTEND_URL],
    ['API_URL', process.env.API_URL],
  ];

  const fautives = attendues
    .filter(([, valeur]) => {
      const v = valeur?.trim();
      if (!v) return true;
      return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(v);
    })
    .map(([nom]) => nom);

  if (fautives.length === 0) return;

  throw new Error(
    `URLs publiques absentes ou pointant vers localhost en production : ${fautives.join(', ')}. ` +
      'Les liens des emails seraient injoignables pour leurs destinataires — ' +
      'renseignez-les dans le .env de production (voir AI/DEPLOYMENT.md §5).',
  );
}
