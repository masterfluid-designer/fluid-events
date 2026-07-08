/**
 * Tests unitaires — Scan decision logic
 * Validation QR + lock atomique (CDC §9.5, §2.2).
 *
 * Propriétés critiques testées (la matrice de décision du scan) :
 *  - QR invalide / expiré → INVALID / EXPIRED (avant toute recherche BDD)
 *  - scanner inactif → INVALID
 *  - payload.eid ≠ scanner.eventId → EVENT_MISMATCH
 *  - event non PUBLISHED → EXPIRED
 *  - OrderItem déjà scanné → ALREADY_USED
 *  - commande non payée → INVALID
 *  - cas nominal → VALID + attendee { name, ticketName } (PAS email/phone)
 *  - garantie minimisation données : email/phone jamais dans la réponse
 */
import { describe, it, expect } from 'vitest';
import { decideScan } from './scan-decision';
import { ScanResult, Role } from '@saas-events/types';
import type { QrVerification } from '../ticket-design/ticket-design.service';

const validQr: QrVerification = {
  valid: true,
  payload: { oid: 'oi-1', eid: 'ev-1', tid: 'tk-1', iat: 1, exp: 9999999999 } as any,
};

describe('decideScan()', () => {
  // ─── Étapes pré-BDD : QR ───────────────────────────────────────────────────
  it('retourne INVALID si le QR est invalide (malformé)', () => {
    const result = decideScan({
      qrVerification: { valid: false, reason: ScanResult.INVALID },
      scanner: null,
      event: null,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne EXPIRED si le QR est expiré', () => {
    const result = decideScan({
      qrVerification: { valid: false, reason: ScanResult.EXPIRED },
      scanner: null,
      event: null,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.EXPIRED);
  });

  // ─── Étape : scanner ───────────────────────────────────────────────────────
  it('retourne INVALID si le scanner est introuvable', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: null,
      event: null,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne INVALID si le scanner est désactivé (isActive=false)', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: false, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  // ─── Étape : correspondance événement ──────────────────────────────────────
  it('retourne EVENT_MISMATCH si le QR ne correspond pas à l\'événement du scanner', () => {
    const qr = {
      valid: true,
      payload: { oid: 'oi-1', eid: 'OTHER-EVENT', tid: 'tk-1', iat: 1, exp: 9 },
    };
    const result = decideScan({
      qrVerification: qr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.EVENT_MISMATCH);
  });

  // ─── Étape : événement actif ───────────────────────────────────────────────
  it('retourne EXPIRED si l\'événement n\'est pas PUBLISHED', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'DRAFT' } as any,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.EXPIRED);
  });

  // ─── Étape : OrderItem ─────────────────────────────────────────────────────
  it('retourne INVALID si l\'OrderItem est introuvable', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne ALREADY_USED si l\'OrderItem a déjà été scanné', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: {
        id: 'oi-1', isScanned: true,
        order: { status: 'PAID', client: { name: 'Jean' } },
        ticket: { name: 'VIP' },
      } as any,
    });
    expect(result.result).toBe(ScanResult.ALREADY_USED);
  });

  it('retourne INVALID si la commande n\'est pas PAID', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: {
        id: 'oi-1', isScanned: false,
        order: { status: 'PENDING', client: { name: 'Jean' } },
        ticket: { name: 'VIP' },
      } as any,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  // ─── Cas nominal : VALID ───────────────────────────────────────────────────
  it('retourne VALID + attendee { name, ticketName } au cas nominal', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: {
        id: 'oi-1', isScanned: false,
        order: { status: 'PAID', client: { name: 'Jean Dupont' } },
        ticket: { name: 'VIP Or' },
      } as any,
    });
    expect(result.result).toBe(ScanResult.VALID);
    expect(result.attendee).toBeDefined();
    expect(result.attendee?.name).toBe('Jean Dupont');
    expect(result.attendee?.ticketName).toBe('VIP Or');
  });

  it('retourne "Inconnu" si le nom du client est absent', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: {
        id: 'oi-1', isScanned: false,
        order: { status: 'PAID', client: { name: null } },
        ticket: { name: 'VIP' },
      } as any,
    });
    expect(result.result).toBe(ScanResult.VALID);
    expect(result.attendee?.name).toBe('Inconnu');
  });

  // ─── Minimisation données (CDC §2.2) ───────────────────────────────────────
  it('la réponse VALID ne contient JAMAIS email ni téléphone du client', () => {
    const result = decideScan({
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: {
        id: 'oi-1', isScanned: false,
        order: {
          status: 'PAID',
          // Le client a email + phone en base, mais ils ne doivent pas remonter
          client: { name: 'Jean', email: 'jean@x.com', phone: '+22890000000' },
        },
        ticket: { name: 'VIP' },
      } as any,
    });
    expect(result.result).toBe(ScanResult.VALID);
    // Sérialisation : on vérifie qu'aucune donnée sensible ne fuite
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('jean@x.com');
    expect(serialized).not.toContain('+22890000000');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
  });
});
