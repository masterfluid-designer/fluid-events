import { Injectable, Logger } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  sanitizeBgColor,
  sanitizeImageUrl,
  buildAllowedImageBase,
  escapeHtml,
} from '@saas-events/utils';
import { QrTokenPayload, ScanResult } from '@saas-events/types';

/** Durée de grâce QR après la fin de l'événement (24h). */
export const QR_GRACE_SECONDS = 24 * 60 * 60;
/** Validité minimale d'un QR (1h), même si l'événement est proche/passé. */
export const QR_MIN_SECONDS = 3600;

export interface TicketRenderParams {
  designImageUrl: string | null | undefined;
  designBgColor: string | null | undefined;
  eventName: string;
  ticketType: string;
  qrCodeBase64: string;
  orderNumber: string;
  clientName: string;
  clientPhone: string;
}

export interface QrVerification {
  valid: boolean;
  payload?: QrTokenPayload & JwtPayload;
  reason?: typeof ScanResult.EXPIRED | typeof ScanResult.INVALID;
}

/**
 * TicketDesignService — Génération/vérification du token QR + rendu HTML du billet.
 *
 * Mitigations de sécurité critiques (CDC §9.2, §9.3) :
 *  - QR signé HS256 avec QR_SECRET (distinct de JWT_SECRET) → un vol de JWT_SECRET
 *    ne permet pas de forger des billets.
 *  - exp = event.endDate + 24h → un billet n'est valide qu'autour de l'événement.
 *  - buildHtml sanitisé : HEX strict, URL whitelistée (bucket Supabase),
 *    escapeHtml sur TOUTES les variables utilisateur → anti-XSS absolu.
 *
 * La génération PDF (Puppeteer) est volontairement séparée (PdfProcessor, BullMQ)
 * et n'est PAS testée unitairement (test d'intégration / E2E à part).
 */
@Injectable()
export class TicketDesignService {
  private readonly logger = new Logger(TicketDesignService.name);

  /**
   * Génère un token QR JWT signé HS256.
   *
   * @param orderItemId ID du OrderItem (1 QR = 1 billet = 1 personne)
   * @param eventId ID de l'événement (vérifié au scan)
   * @param ticketId ID du type de billet
   * @param eventEndDate Date de fin → calcule exp = endDate + 24h
   */
  generateQrToken(
    orderItemId: string,
    eventId: string,
    ticketId: string,
    eventEndDate: Date,
  ): string {
    const secret = process.env.QR_SECRET;
    if (!secret) {
      throw new Error('QR_SECRET manquant — impossible de signer le billet.');
    }

    const expTimestamp =
      Math.floor(eventEndDate.getTime() / 1000) + QR_GRACE_SECONDS;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Math.max(expTimestamp - now, QR_MIN_SECONDS);

    const payload: QrTokenPayload = {
      oid: orderItemId,
      eid: eventId,
      tid: ticketId,
      iat: now,
      exp: now + expiresIn, // au moins 1h
    };

    return jwt.sign(payload, secret, { algorithm: 'HS256' });
  }

  /**
   * Vérifie et décode un token QR.
   * @returns { valid, payload?, reason? } — jamais d'exception (géré par le scanner).
   */
  verifyQrToken(token: string): QrVerification {
    const secret = process.env.QR_SECRET;
    if (!secret || !token) {
      return { valid: false, reason: ScanResult.INVALID };
    }
    try {
      const payload = jwt.verify(token, secret) as QrTokenPayload & JwtPayload;
      return { valid: true, payload };
    } catch (err) {
      const reason =
        err instanceof jwt.TokenExpiredError
          ? ScanResult.EXPIRED
          : ScanResult.INVALID;
      return { valid: false, reason };
    }
  }

  /**
   * Construit le HTML du billet, TOUTE entrée sanitisée (CDC §9.3, §9.4).
   *
   * Mitigations XSS appliquées (cf. @saas-events/utils) :
   *  - designBgColor  → sanitizeBgColor (HEX strict ou défaut #d4ac0d)
   *  - designImageUrl → sanitizeImageUrl (whitelist bucket Supabase)
   *  - toutes autres variables → escapeHtml
   *
   * Si `designImageUrl` est absent (cas courant — pas d'image personnalisée),
   * SUPABASE_URL n'est même pas requis : la vérification de whitelist ne sert
   * qu'à valider une image réellement fournie.
   */
  buildHtml(params: TicketRenderParams): string {
    // ── Sanitisation de chaque variable (jamais d'interpolation brute) ──────
    const bgColor = sanitizeBgColor(params.designBgColor);
    const imageUrl = params.designImageUrl ? this.sanitizeDesignImageUrl(params.designImageUrl) : '';
    const eventName = escapeHtml(params.eventName);
    const ticketType = escapeHtml(params.ticketType);
    const orderNumber = escapeHtml(params.orderNumber);
    const clientName = escapeHtml(params.clientName);
    const clientPhone = escapeHtml(params.clientPhone);
    const qrCodeBase64 = escapeHtml(params.qrCodeBase64);

    // L'image de fond n'est injectée que si l'URL est whitelistée
    const bgImageCss = imageUrl ? `background-image: url('${imageUrl}');` : '';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: 700px; }
    .billet {
      width: 700px; height: 400px;
      display: flex; border: 1px solid #ccc;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;
    }
    .image-section {
      width: 400px; height: 100%; flex-shrink: 0;
      background-color: ${bgColor};
      ${bgImageCss}
      background-size: cover; background-position: center;
    }
    .info-section {
      flex: 1; padding: 20px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: white; text-align: center;
    }
    .event-name  { font-size: 0.85em; font-weight: 700; color: #111; text-transform: uppercase; }
    .ticket-type { font-size: 0.75em; color: #666; margin: 4px 0 8px; }
    .qr-area     { width: 160px; height: 160px; margin: 8px 0; }
    .qr-area img { width: 100%; height: 100%; }
    .text-data   { font-size: 0.78em; line-height: 1.6; color: #333; margin-top: 8px; }
    .text-data strong { color: #111; }
  </style>
</head>
<body>
  <div class="billet">
    <div class="image-section"></div>
    <div class="info-section">
      <div class="event-name">${eventName}</div>
      <div class="ticket-type">${ticketType}</div>
      <div class="qr-area"><img src="${qrCodeBase64}" alt="QR Code" /></div>
      <div class="text-data">
        <strong>Référence :</strong> ${orderNumber}<br>
        <strong>Nom :</strong> ${clientName}<br>
        <strong>Tél :</strong> ${clientPhone}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Valide `designImageUrl` contre la whitelist du bucket (CDC §9.3).
   * Non-bloquant : si SUPABASE_URL est absent (dev sans Supabase configuré),
   * on ignore l'image plutôt que de faire échouer toute la génération du
   * billet pour une fonctionnalité optionnelle.
   */
  private sanitizeDesignImageUrl(url: string): string {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      this.logger.warn(
        'SUPABASE_URL manquant — image de design ignorée (whitelist impossible).',
      );
      return '';
    }
    return sanitizeImageUrl(url, buildAllowedImageBase(supabaseUrl));
  }
}
