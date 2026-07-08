/**
 * Constantes globales partagées.
 * Lecture de process.env ici (ConfigModule est global et a déjà chargé le .env).
 */

/** URL du frontend — utilisée pour les redirections OAuth et le CORS. */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
