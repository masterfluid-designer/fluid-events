/**
 * @saas-events/types — Contrats TypeScript partagés (frontend + backend)
 *
 * Source unique de vérité pour les enums, payloads JWT, QR, paiements, scanner,
 * builder, format de réponse API et codes d'erreur.
 * Référence : CDC v2.0.0 — sections 4, 6.12, 7.6, 8.1, 9.1, 10, 11, 15.4
 */

// ─────────────────────────────────────────────────────────────────────────────
// RBAC — Rôles & Permissions (CDC §4)
// ─────────────────────────────────────────────────────────────────────────────

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANAGER: 'MANAGER',
  SCANNER: 'SCANNER',
  CLIENT: 'CLIENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/**
 * Intent propagé via le `state` OAuth Google (CDC §7.4, décision produit
 * 2026-07-14) : `buy` = tunnel d'achat client existant, `become_manager` =
 * inscription self-service Manager depuis la page d'accueil du SaaS.
 * N'a d'effet que sur la CRÉATION d'un compte — jamais sur un compte existant
 * (pas d'escalade de privilège silencieuse via ce paramètre).
 */
export const GoogleAuthIntent = {
  BUY: 'buy',
  BECOME_MANAGER: 'become_manager',
} as const;

export type GoogleAuthIntent = (typeof GoogleAuthIntent)[keyof typeof GoogleAuthIntent];

export const EventStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentProviderType = {
  KKIAPAY: 'KKIAPAY',
  CINETPAY: 'CINETPAY',
  FEDAPAY: 'FEDAPAY',
} as const;

export type PaymentProviderType = (typeof PaymentProviderType)[keyof typeof PaymentProviderType];

export const ScanResult = {
  VALID: 'VALID',
  ALREADY_USED: 'ALREADY_USED',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID',
  EVENT_MISMATCH: 'EVENT_MISMATCH',
} as const;

export type ScanResult = (typeof ScanResult)[keyof typeof ScanResult];

// ─────────────────────────────────────────────────────────────────────────────
// JWT (CDC §7.6)
// ─────────────────────────────────────────────────────────────────────────────

/** Payload du JWT client. exp calé sur event.endDate + 24h (session événementielle). */
export interface JwtPayload {
  /** userId */
  sub: string;
  email: string;
  role: Role;
  /** Scanners uniquement */
  eventId?: string;
  /** Clients : timestamp Unix (event.endDate + 24h). Lisible côté frontend. */
  sessionExpiresAt?: number;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// QR Code (CDC §9.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload du token QR. Signé HS256 avec QR_SECRET (distinct de JWT_SECRET).
 * exp = event.endDate + 24h.
 */
export interface QrTokenPayload {
  /** orderItemId */
  oid: string;
  /** eventId */
  eid: string;
  /** ticketId */
  tid: string;
  /** timestamp génération (Unix) */
  iat: number;
  /** expiration = event.endDate + 24h (Unix) */
  exp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paiements (CDC §8.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Pas de `provider` : déterminé côté serveur depuis la config active de l'événement (2026-07-13). */
export interface InitPaymentDto {
  ticketId: string;
}

/**
 * Réponse de POST /api/payments/init pour Kkiapay.
 *
 * ⚠️ Kkiapay n'a pas de "checkoutUrl" serveur : le paiement s'initie côté
 * client via le widget JS (`openKkiapayWidget`), avec `partnerId` (= orderId)
 * passé en donnée de corrélation, retrouvé tel quel dans le webhook.
 */
export interface KkiapayInitResult {
  provider: 'KKIAPAY';
  orderId: string;
  /** = orderId — transmis au widget Kkiapay pour corrélation (champ `partnerId`). */
  partnerId: string;
  amount: number;
  currency: string;
  /** Clé publique Kkiapay — sûre à exposer côté client (champ `key` du widget). */
  publicKey: string;
  sandbox: boolean;
}

/**
 * Réponse de POST /api/payments/init pour CinetPay/FedaPay — contrairement à
 * Kkiapay, ces deux providers renvoient une URL de paiement hébergée server-side
 * (CinetPay `payment_url`, FedaPay `transactions/{id}/token` → `url`) : le
 * frontend redirige simplement le navigateur, pas de widget JS embarqué.
 */
export interface RedirectPaymentInitResult {
  provider: 'CINETPAY' | 'FEDAPAY';
  orderId: string;
  checkoutUrl: string;
}

export type PaymentInitResult = KkiapayInitResult | RedirectPaymentInitResult;

/**
 * Payload webhook Kkiapay (POST /api/payments/webhook/kkiapay).
 * `partnerId` = notre `Order.id`, transmis au widget à l'ouverture (corrélation).
 * Authentifié via l'en-tête `x-kkiapay-secret` (secret partagé, pas de HMAC).
 */
export interface KkiapayWebhookPayload {
  transactionId: string;
  isPaymentSucces: boolean;
  event: 'transaction.success' | 'transaction.failed' | string;
  account?: string | null;
  failureCode?: string;
  failureMessage?: string;
  label?: string;
  method?: 'MOBILE_MONEY' | 'WALLET' | 'CARD' | string;
  amount?: number;
  fees?: number;
  partnerId?: string;
  performedAt?: string;
  stateData?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner (CDC §9.5, §10)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Données retournées au scanner. ⚠️ email et phone du client ne sont
 * JAMAIS inclus (minimisation des données — CDC §2.2).
 */
export interface ScanValidationResult {
  result: ScanResult;
  attendee?: {
    name: string;
    ticketName: string;
    scannedAt: Date;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Builder (CDC §11)
// ─────────────────────────────────────────────────────────────────────────────

export type BlockType =
  | 'hero'
  | 'text'
  | 'image'
  | 'video'
  | 'gallery'
  | 'countdown'
  | 'tickets'
  | 'faq'
  | 'schedule'
  | 'testimonials'
  | 'sponsors'
  | 'speakers'
  | 'html';

// ─────────────────────────────────────────────────────────────────────────────
// Contenu centralisé de l'événement (décision produit 2026-07-13)
//
// Un seul jeu de contenu par événement (FAQ, Programme, Speakers, Galerie,
// Sponsors), édité depuis l'onglet "Config" du Builder. Les blocs `faq`/
// `schedule`/`speakers`/`gallery`/`sponsors` sont de simples marqueurs de
// placement sur la page — ils n'ont pas de `props` propres, ils affichent ce
// contenu quand ils sont posés sur la page.
// ─────────────────────────────────────────────────────────────────────────────

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export interface ScheduleEntry {
  id: string;
  /** ISO datetime — date ET heure précises de l'entrée de programme. */
  startsAt: string;
  title: string;
  description?: string;
}

export interface SpeakerEntry {
  id: string;
  name: string;
  role: string;
  photoUrl?: string;
}

/** Entrée générique image (galerie, sponsors) — juste une URL whitelistée. */
export interface MediaEntry {
  id: string;
  url: string;
}

export interface BlockStyles {
  /** HEX uniquement — validé par Zod côté backend */
  backgroundColor?: string;
  paddingY?: 'sm' | 'md' | 'lg' | 'xl';
  textAlign?: 'left' | 'center' | 'right';
  /**
   * Classes Tailwind libres ajoutées au conteneur du bloc (décision produit
   * 2026-07-13). Validées côté backend par une regex restreinte à la syntaxe
   * Tailwind (RULES.md — jamais de confiance aveugle dans du texte libre),
   * mais Tailwind v4 ne génère du CSS que pour les classes détectées dans le
   * code source au build : une classe totalement inédite tapée à l'exécution
   * n'aura aucun effet visuel tant qu'elle n'existe pas déjà ailleurs dans le
   * bundle compilé (ou dans un `@source inline(...)` dédié, non ajouté ici).
   */
  customClassName?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  order: number;
  props: Record<string, unknown>;
  styles?: BlockStyles;
}

/** DTO pour la sauvegarde des blocs — inclut le contrôle de concurrence optimiste. */
export interface SaveBlocksDto {
  blocks: Block[];
  /** ISO datetime — si EventPage.updatedAt > cette valeur → 409 CONFLICT */
  lastKnownUpdatedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format de réponse API standardisé (CDC §6.12)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────────────────────────────────────
// Codes d'erreur standardisés (CDC §15.4)
// ─────────────────────────────────────────────────────────────────────────────

export const ErrorCodes = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  AUTH_REQUIRED_TO_PURCHASE: 'AUTH_REQUIRED_TO_PURCHASE',
  // Events
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_NOT_ACTIVE: 'EVENT_NOT_ACTIVE',
  EVENT_EXPIRED: 'EVENT_EXPIRED',
  // Tickets
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  TICKET_SOLD_OUT: 'TICKET_SOLD_OUT',
  TICKET_SALE_NOT_STARTED: 'TICKET_SALE_NOT_STARTED',
  TICKET_SALE_ENDED: 'TICKET_SALE_ENDED',
  // Paiements
  PAYMENT_INIT_FAILED: 'PAYMENT_INIT_FAILED',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_ALREADY_PROCESSED: 'WEBHOOK_ALREADY_PROCESSED',
  PROVIDER_NOT_ACTIVE: 'PROVIDER_NOT_ACTIVE',
  PROVIDER_EXECUTION_NOT_SUPPORTED: 'PROVIDER_EXECUTION_NOT_SUPPORTED',
  STOCK_RACE_CONDITION: 'STOCK_RACE_CONDITION',
  // Scan
  QR_INVALID: 'QR_INVALID',
  QR_EXPIRED: 'QR_EXPIRED',
  QR_ALREADY_SCANNED: 'QR_ALREADY_SCANNED',
  QR_EVENT_MISMATCH: 'QR_EVENT_MISMATCH',
  // Scanner
  SCANNER_QUOTA_EXCEEDED: 'SCANNER_QUOTA_EXCEEDED',
  SCANNER_NOT_ACTIVE: 'SCANNER_NOT_ACTIVE',
  // Builder
  BUILDER_CONFLICT: 'BUILDER_CONFLICT',
  BUILDER_SCHEMA_INVALID: 'BUILDER_SCHEMA_INVALID',
  // Design
  DESIGN_IMAGE_TOO_LARGE: 'DESIGN_IMAGE_TOO_LARGE',
  DESIGN_IMAGE_FORMAT_INVALID: 'DESIGN_IMAGE_FORMAT_INVALID',
  DESIGN_IMAGE_URL_INVALID: 'DESIGN_IMAGE_URL_INVALID',
  // WhatsApp
  WHATSAPP_NO_PHONE: 'WHATSAPP_NO_PHONE',
  WHATSAPP_PHONE_INVALID: 'WHATSAPP_PHONE_INVALID',
  WHATSAPP_SEND_FAILED: 'WHATSAPP_SEND_FAILED',
  // Comptes (invitation Manager, impersonation — décision produit 2026-07-14)
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVITE_TOKEN_INVALID: 'INVITE_TOKEN_INVALID',
  INVITE_TOKEN_EXPIRED: 'INVITE_TOKEN_EXPIRED',
  MANAGER_NOT_FOUND: 'MANAGER_NOT_FOUND',
  NOT_IMPERSONATING: 'NOT_IMPERSONATING',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
