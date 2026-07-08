/**
 * Tests unitaires — PhoneService
 * Validation et normalisation E.164 via libphonenumber-js (CDC §7.9, §12).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PhoneService } from './phone.service';

describe('PhoneService — normalizeToE164()', () => {
  let service: PhoneService;
  beforeEach(() => {
    service = new PhoneService();
  });

  it('normalise un numéro togolais valide', () => {
    // +228 90 12 34 56 (Togo, Orange)
    const result = service.normalizeToE164('+22890123456');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\+228/);
  });

  it('normalise un numéro ivoirien valide', () => {
    // +225 07 00 000 000 (Côte d'Ivoire)
    const result = service.normalizeToE164('+2250700000000');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\+225/);
  });

  it('retourne null pour un numéro invalide (trop court)', () => {
    expect(service.normalizeToE164('+228123')).toBeNull();
  });

  it('retourne null pour du texte non-numérique', () => {
    expect(service.normalizeToE164('pas un numero')).toBeNull();
  });

  it('retourne null pour une chaîne vide', () => {
    expect(service.normalizeToE164('')).toBeNull();
    expect(service.normalizeToE164(null as any)).toBeNull();
  });
});

describe('PhoneService — normalizeForWhatsapp()', () => {
  let service: PhoneService;
  beforeEach(() => {
    service = new PhoneService();
  });

  it('retourne le numéro E.164 SANS le + (format Meta Cloud API)', () => {
    const result = service.normalizeForWhatsapp('+22890123456');
    expect(result).not.toBeNull();
    expect(result).not.toContain('+');
    expect(result).toMatch(/^228/);
  });

  it('retourne null pour un numéro invalide (skip WhatsApp)', () => {
    expect(service.normalizeForWhatsapp('invalid')).toBeNull();
    expect(service.normalizeForWhatsapp('')).toBeNull();
  });
});

describe('PhoneService — extractAndValidatePhone()', () => {
  let service: PhoneService;
  beforeEach(() => {
    service = new PhoneService();
  });

  it('extrait le téléphone du champ provider Kkiapay', () => {
    const payload = { phone: '+22890123456' };
    expect(service.extractAndValidatePhone(payload)).toMatch(/^\+228/);
  });

  it('extrait le téléphone du champ CinetPay', () => {
    const payload = { customer_phone_number: '+22890123456' };
    expect(service.extractAndValidatePhone(payload)).toMatch(/^\+228/);
  });

  it('extrait le téléphone imbriqué (FedaPay transaction.customer.phone)', () => {
    const payload = { transaction: { customer: { phone: '+22890123456' } } };
    expect(service.extractAndValidatePhone(payload)).toMatch(/^\+228/);
  });

  it('retourne null si aucun champ téléphone présent', () => {
    expect(service.extractAndValidatePhone({ other: 'data' })).toBeNull();
  });

  it('retourne null si le téléphone extrait est invalide', () => {
    expect(service.extractAndValidatePhone({ phone: 'xyz123' })).toBeNull();
  });

  it('gère un payload null/undefined', () => {
    expect(service.extractAndValidatePhone(null)).toBeNull();
    expect(service.extractAndValidatePhone(undefined)).toBeNull();
  });
});
