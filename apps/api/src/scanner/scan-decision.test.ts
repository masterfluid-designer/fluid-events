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
import { decideScan, civilDateInTimeZone } from './scan-decision';
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
      now: new Date(),
      qrVerification: { valid: false, reason: ScanResult.INVALID },
      scanner: null,
      event: null,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne EXPIRED si le QR est expiré', () => {
    const result = decideScan({
      now: new Date(),
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
      now: new Date(),
      qrVerification: validQr,
      scanner: null,
      event: null,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne INVALID si le scanner est désactivé (isActive=false)', () => {
    const result = decideScan({
      now: new Date(),
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
      now: new Date(),
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
      now: new Date(),
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
      now: new Date(),
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: { id: 'ev-1', status: 'PUBLISHED' } as any,
      orderItem: null,
    });
    expect(result.result).toBe(ScanResult.INVALID);
  });

  it('retourne ALREADY_USED si l\'OrderItem a déjà été scanné', () => {
    const result = decideScan({
      now: new Date(),
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
      now: new Date(),
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
      now: new Date(),
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
      now: new Date(),
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
      now: new Date(),
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

/**
 * Régimes multi-jours (décision produit 2026-08-16).
 *
 * Ce qui compte ici : un billet ne doit jamais ouvrir une journée qui n'est
 * pas la sienne, et un pass doit ouvrir chaque journée exactement une fois.
 */
describe('decideScan() — régimes multi-jours', () => {
  const DAY_1 = { id: 'd-1', date: new Date('2026-08-08T00:00:00.000Z') };
  const DAY_2 = { id: 'd-2', date: new Date('2026-08-09T00:00:00.000Z') };

  function ctx(overrides: {
    policy: string;
    now: Date;
    ticketDayId?: string | null;
    timezone?: string;
  }) {
    return {
      qrVerification: validQr,
      scanner: { id: 'sc-1', isActive: true, eventId: 'ev-1' } as any,
      event: {
        id: 'ev-1',
        status: 'PUBLISHED',
        ticketPolicy: overrides.policy,
        timezone: overrides.timezone ?? 'Africa/Abidjan',
        days: [DAY_1, DAY_2],
      } as any,
      orderItem: {
        id: 'oi-1',
        isScanned: false,
        order: { status: 'PAID', client: { name: 'Jean Dupont' } },
        ticket: { name: 'VIP Or', eventDayId: overrides.ticketDayId ?? null },
      } as any,
      now: overrides.now,
    };
  }

  // ─── PER_DAY ──────────────────────────────────────────────────────────────

  it('PER_DAY : accepte le billet le jour auquel il est rattaché', () => {
    const result = decideScan(
      ctx({ policy: 'PER_DAY', ticketDayId: 'd-1', now: new Date('2026-08-08T10:00:00.000Z') }),
    );
    expect(result.result).toBe(ScanResult.VALID);
    // Un billet PER_DAY reste à usage unique : c'est `isScanned` qui l'assure.
    expect(result.shouldMarkScanned).toBe(true);
    expect(result.dayScanFor).toBeUndefined();
  });

  it('PER_DAY : refuse le billet du Jour 2 présenté le Jour 1', () => {
    const result = decideScan(
      ctx({ policy: 'PER_DAY', ticketDayId: 'd-2', now: new Date('2026-08-08T10:00:00.000Z') }),
    );
    expect(result.result).toBe(ScanResult.WRONG_DAY);
  });

  it("PER_DAY : refuse un billet sans journée plutôt que d'ouvrir par défaut", () => {
    // Cas réel possible : billet créé avant le passage du régime en PER_DAY.
    // Une porte qui s'ouvre par accident est pire qu'un refus rattrapable.
    const result = decideScan(
      ctx({ policy: 'PER_DAY', ticketDayId: null, now: new Date('2026-08-08T10:00:00.000Z') }),
    );
    expect(result.result).toBe(ScanResult.WRONG_DAY);
  });

  // ─── PASS_ALL_DAYS ────────────────────────────────────────────────────────

  it('PASS_ALL_DAYS : accepte chaque journée déclarée et désigne celle du jour', () => {
    const jour1 = decideScan(
      ctx({ policy: 'PASS_ALL_DAYS', now: new Date('2026-08-08T10:00:00.000Z') }),
    );
    expect(jour1.result).toBe(ScanResult.VALID);
    expect(jour1.dayScanFor).toBe('d-1');

    const jour2 = decideScan(
      ctx({ policy: 'PASS_ALL_DAYS', now: new Date('2026-08-09T10:00:00.000Z') }),
    );
    expect(jour2.result).toBe(ScanResult.VALID);
    expect(jour2.dayScanFor).toBe('d-2');
  });

  it('PASS_ALL_DAYS : ne consomme JAMAIS le verrou d’usage unique', () => {
    // Sinon la première entrée grillerait le pass pour tout le reste de
    // l'événement — c'est exactement ce que ce régime doit éviter.
    const result = decideScan(
      ctx({ policy: 'PASS_ALL_DAYS', now: new Date('2026-08-08T10:00:00.000Z') }),
    );
    expect(result.shouldMarkScanned).toBeUndefined();
  });

  it('PASS_ALL_DAYS : refuse hors des journées déclarées', () => {
    const result = decideScan(
      ctx({ policy: 'PASS_ALL_DAYS', now: new Date('2026-08-10T10:00:00.000Z') }),
    );
    expect(result.result).toBe(ScanResult.WRONG_DAY);
  });

  // ─── Fuseau horaire ───────────────────────────────────────────────────────

  it('compare le jour dans le fuseau de l’événement, pas en UTC', () => {
    // 8 août 20 h à New York = 9 août 00 h UTC. Le porteur se présente le
    // soir même de sa journée : lire l'heure UTC le renverrait à tort.
    const result = decideScan(
      ctx({
        policy: 'PER_DAY',
        ticketDayId: 'd-1',
        timezone: 'America/New_York',
        now: new Date('2026-08-09T00:00:00.000Z'),
      }),
    );
    expect(result.result).toBe(ScanResult.VALID);
  });

  it('SINGLE_DAY : comportement inchangé, aucune notion de journée', () => {
    const result = decideScan(
      ctx({ policy: 'SINGLE_DAY', now: new Date('2030-01-01T10:00:00.000Z') }),
    );
    // Date très postérieure aux journées déclarées : sans régime multi-jours,
    // elle ne doit jouer aucun rôle.
    expect(result.result).toBe(ScanResult.VALID);
    expect(result.shouldMarkScanned).toBe(true);
  });
});

describe('civilDateInTimeZone()', () => {
  it('rend la date civile du fuseau demandé', () => {
    expect(
      civilDateInTimeZone(new Date('2026-08-09T00:00:00.000Z'), 'America/New_York'),
    ).toBe('2026-08-08');
    expect(civilDateInTimeZone(new Date('2026-08-09T00:00:00.000Z'), 'Africa/Abidjan')).toBe(
      '2026-08-09',
    );
  });

  it('retombe sur UTC si le fuseau est invalide plutôt que de tout refuser', () => {
    expect(civilDateInTimeZone(new Date('2026-08-09T12:00:00.000Z'), 'Pas/UnFuseau')).toBe(
      '2026-08-09',
    );
  });
});
