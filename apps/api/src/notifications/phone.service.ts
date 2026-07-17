import { Injectable, Logger } from '@nestjs/common';
import { parsePhoneNumber } from 'libphonenumber-js';

/**
 * PhoneService — Validation et normalisation des numéros de téléphone.
 *
 * Mitigation de robustesse du CDC §7.9 et §12 : les providers africains
 * collectent téléphone et pays au checkout. On valide/normalise en E.164
 * (libphonenumber-js) avant tout stockage ou envoi WhatsApp.
 *
 *  - normalizeToE164 : format canonique international (+228...) — stockage BDD
 *  - normalizeForWhatsapp : E.164 sans le '+' — format Meta Cloud API
 *  - extractAndValidatePhone : extraction multi-provider (Kkiapay/CinetPay/FedaPay)
 */
@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name);

  /**
   * Normalise un numéro au format E.164 (+pays...).
   * @returns le numéro normalisé, ou null si invalide/introuvable.
   */
  normalizeToE164(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
      const parsed = parsePhoneNumber(String(raw));
      if (!parsed?.isValid()) return null;
      return parsed.format('E.164');
    } catch {
      return null;
    }
  }

  /**
   * Normalise pour l'API WhatsApp Meta Cloud : E.164 SANS le '+'.
   * (Meta exige `to: "22890123456"`, pas `+22890123456`).
   */
  normalizeForWhatsapp(raw: string | null | undefined): string | null {
    const e164 = this.normalizeToE164(raw);
    if (!e164) return null;
    return e164.replace('+', '');
  }

  /**
   * Extrait et valide le téléphone d'un payload webhook, en gérant les
   * différents formats providers (CDC §7.9) :
   *  - Kkiapay      : payload.phone
   *  - CinetPay     : payload.customer_phone_number
   *  - FedaPay      : payload.transaction.customer.phone
   *
   * @returns le numéro E.164 valide, ou null si absent/invalide.
   */
  extractAndValidatePhone(payload: any): string | null {
    if (!payload) return null;
    const raw =
      payload.phone ??
      payload.customer_phone_number ??
      payload.transaction?.customer?.phone ??
      null;
    return this.normalizeToE164(raw);
  }

  /**
   * Déduit le pays (code ISO 3166-1 alpha-2, ex: "CI", "FR") directement de
   * l'indicatif du numéro — jamais demandé séparément à l'utilisateur
   * (décision produit 2026-07-15, vérification téléphone obligatoire).
   * @returns le code pays, ou null si le numéro est invalide.
   */
  deriveCountry(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
      const parsed = parsePhoneNumber(String(raw));
      if (!parsed?.isValid()) return null;
      return parsed.country ?? null;
    } catch {
      return null;
    }
  }
}
