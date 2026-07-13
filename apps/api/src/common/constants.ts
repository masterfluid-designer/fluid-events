/**
 * Constantes globales partagées.
 * Lecture de process.env ici (ConfigModule est global et a déjà chargé le .env).
 */

/** URL du frontend — utilisée pour les redirections OAuth et le CORS. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

/** URL publique de l'API — utilisée pour les notify_url/callback_url CinetPay/FedaPay. */
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
