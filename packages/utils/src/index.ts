/**
 * @saas-events/utils — Fonctions utilitaires pures.
 *
 * Toutes ces fonctions sont testées unitairement (TDD) et constituent les briques
 * de base des mitigations de sécurité du CDC v2.0.0 :
 *  - parsing des durées JWT (session événementielle §7.2)
 *  - sanitisation HEX / URL / HTML (anti-XSS billet §9.3)
 *  - validation téléphone E.164 (§7.9, §12)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Parsing de durée (CDC §7.2 — parseDurationToSeconds)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit une durée au format JWT ("7d", "3600s", "30m", "2h") en secondes.
 * Fallback : 1h si format non reconnu.
 */
export function parseDurationToSeconds(dur: string): number {
  if (typeof dur !== 'string' || dur.length === 0) return 3600;
  const match = /^(\d+)\s*([smhd])?$/.exec(dur.trim());
  if (!match) return 3600;
  const value = parseInt(match[1], 10);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * multipliers[unit];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitisation couleurs HEX (CDC §9.3 — sanitizeBgColor)
// ─────────────────────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const DEFAULT_TICKET_BG_COLOR = '#d4ac0d';

/** Valide qu'une couleur est au format HEX 6 chiffres. Bloque toute injection CSS. */
export function isValidHexColor(color: string): boolean {
  return typeof color === 'string' && HEX_RE.test(color);
}

/** Retourne la couleur si elle est HEX valide, sinon la couleur par défaut (#d4ac0d). */
export function sanitizeBgColor(color: string | null | undefined): string {
  return isValidHexColor(color ?? '') ? (color as string) : DEFAULT_TICKET_BG_COLOR;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitisation URL image billet (CDC §9.3 — sanitizeImageUrl)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construit le préfixe du bucket public autorisé pour les images de billet.
 * Toute URL en dehors de ce préfixe est rejetée (bloque les URLs externes / data:).
 */
export function buildAllowedImageBase(supabaseUrl: string): string {
  const origin = new URL(supabaseUrl).origin;
  return `${origin}/storage/v1/object/public/ticket-designs/`;
}

/**
 * Équivalent de `buildAllowedImageBase` pour le stockage S3-compatible générique
 * (RustFS/MinIO en dev, ou Supabase Storage via son endpoint S3 — `STORAGE_*`,
 * voir `StorageService`), qui construit ses URLs publiques en
 * `${endpoint}/${bucket}/${key}` (path-style), pas via l'API REST Supabase.
 */
export function buildAllowedStorageBase(endpoint: string, bucket: string): string {
  return `${endpoint.replace(/\/$/, '')}/${bucket}/`;
}

/**
 * Valide qu'une URL pointe vers le bucket Supabase autorisé.
 * - Rejette les URLs malformées (retourne '')
 * - Rejette les protocoles non-HTTP (data:, javascript:, file:)
 * - Rejette les URLs externes au bucket ticket-designs/
 */
export function sanitizeImageUrl(
  url: string | null | undefined,
  allowedBase: string,
): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Protocole strictement http/https — bloque data: et javascript:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href.startsWith(allowedBase) ? parsed.href : '';
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Échappement HTML (CDC §9.3 — escapeHtml)
// ─────────────────────────────────────────────────────────────────────────────

/** Échappe les caractères dangereux pour injection dans du HTML. */
export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation pays ISO 2 lettres (CDC §7.9 — extractCountry)
// ─────────────────────────────────────────────────────────────────────────────

const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

/** Valide et normalise un code pays ISO 3166-1 alpha-2 (ex: TG, CI, BJ). */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = String(raw).toUpperCase();
  return ISO_COUNTRY_RE.test(upper) ? upper : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent d'achat horodaté (CDC §7.4 — saveIntent / consumeIntent)
// ─────────────────────────────────────────────────────────────────────────────

export const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface BuyIntent {
  ticketId: string;
  timestamp: number;
}

/**
 * Stocke un intent d'achat en sessionStorage (clé spécifique à l'événement).
 * Utilisable côté navigateur uniquement — testé via une Storage injectée.
 * Le paramètre `now` (injectable) permet de tester l'expiration de façon déterministe.
 */
export function saveIntent(
  eventSlug: string,
  ticketId: string,
  storage: Storage = typeof sessionStorage !== 'undefined' ? sessionStorage : (null as any),
  now: () => number = Date.now,
): void {
  if (!storage) return;
  const intent: BuyIntent = { ticketId, timestamp: now() };
  storage.setItem(`buy_intent_${eventSlug}`, JSON.stringify(intent));
}

/**
 * Consomme (et supprime) un intent d'achat. Retourne null si :
 *  - absent / illisible
 *  - expiré (> 30 min)
 */
export function consumeIntent(
  eventSlug: string,
  storage: Storage = typeof sessionStorage !== 'undefined' ? sessionStorage : (null as any),
  now: () => number = Date.now,
): { ticketId: string } | null {
  if (!storage) return null;
  const key = `buy_intent_${eventSlug}`;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const intent = JSON.parse(raw) as BuyIntent;
    storage.removeItem(key); // Toujours consommer = supprimer
    if (now() - intent.timestamp > INTENT_TTL_MS) return null; // expiré
    return { ticketId: intent.ticketId };
  } catch {
    storage.removeItem(key);
    return null;
  }
}
