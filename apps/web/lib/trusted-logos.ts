import { api, apiUpload } from "@/lib/api";

/**
 * Client de la section "Confiance" (logos "Ils nous font confiance") —
 * centralise le contrat d'API entre la page admin (/admin/trusted-logos) et
 * le backend, pour ne pas dupliquer les URLs/formes de données à plusieurs
 * endroits. Le titre/eyebrow de la section n'est PAS géré ici : il est
 * édité à la main dans lib/content/landing/trusted.ts (décision produit
 * 2026-07-23 — seuls les logos restent pilotables depuis l'admin).
 *
 * La lecture publique (landing, SSR) reste séparée dans
 * trusted-logos.server.ts — fetch serveur sans cookies, contexte différent
 * du fetch client authentifié utilisé ici — mais partage le même type
 * `TrustedLogo`.
 */

const FOLDER = "trusted-logos";

export interface TrustedLogo {
  key: string;
  url: string;
}

export interface TrustedLogoCandidate {
  id: string;
  title: string;
  logoUrl: string;
  /** Clé S3 si ce logo est déjà repris dans "Confiance", sinon null. */
  addedKey: string | null;
}

export function listTrustedLogos(): Promise<{ items: TrustedLogo[] }> {
  return api<{ items: TrustedLogo[] }>(`/api/storage/media-folders/${FOLDER}`);
}

export function uploadTrustedLogo(file: File): Promise<{ url: string }> {
  return apiUpload(`/api/storage/media-folders/${FOLDER}`, file);
}

export function removeTrustedLogo(key: string): Promise<unknown> {
  return api(`/api/storage/media-folders/${FOLDER}`, { method: "DELETE", params: { key } });
}

/** Événements ayant un logo, utilisables pour la section Confiance (choix de l'Admin). */
export function listTrustedLogoCandidates(): Promise<TrustedLogoCandidate[]> {
  return api<TrustedLogoCandidate[]>("/api/admin/trusted-logo-candidates");
}

/** Copie le logo de cet événement dans le dossier trusted-logos/. */
export function addEventLogoToTrusted(eventId: string): Promise<{ url: string }> {
  return api<{ url: string }>(`/api/admin/trusted-logo-candidates/${eventId}`, { method: "POST" });
}
