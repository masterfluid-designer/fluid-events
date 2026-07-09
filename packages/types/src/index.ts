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

export interface InitPaymentParams {
  /** En centimes */
  amount: number;
  /** XOF, XAF, GNF... */
  currency: string;
  orderId: string;
  description: string;
  /** URL webhook */
  callbackUrl: string;
  /** Redirect succès */
  returnUrl: string;
  /** Redirect annulation */
  cancelUrl: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
}

export interface PaymentInitResult {
  checkoutUrl: string;
  transactionId: string;
  orderId: string;
}

export type TransactionStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface InitPaymentDto {
  ticketId: string;
  provider: PaymentProviderType;
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
  | 'sponsors';

export interface BlockStyles {
  /** HEX uniquement — validé par Zod côté backend */
  backgroundColor?: string;
  paddingY?: 'sm' | 'md' | 'lg' | 'xl';
  textAlign?: 'left' | 'center' | 'right';
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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
