/**
 * Tests unitaires — TicketDesignService
 * Génération QR JWT + sanitisation XSS du template billet (CDC §9.2, §9.3).
 *
 * Propriétés critiques testées :
 *  - QR signé HS256 avec QR_SECRET (distinct de JWT_SECRET)
 *  - exp = event.endDate + 24h (grâce événementielle)
 *  - min 1h de validité
 *  - buildHtml sanitisé : HEX strict + URL whitelistée + escapeHtml sur toutes les vars
 *  - décodage réussit et retrouve les bons payloads
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { TicketDesignService } from './ticket-design.service';

// Fixe le temps pour des exp déterministes
const FIXED_NOW = new Date('2026-06-01T12:00:00Z').getTime();
vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

const QR_SECRET = 'qr-secret-32-chars-min-xxxxxxx';
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const ALLOWED_BASE = 'https://xxxxx.supabase.co/storage/v1/object/public/ticket-designs/';

describe('TicketDesignService — generateQrToken()', () => {
  let service: TicketDesignService;

  beforeEach(() => {
    process.env.QR_SECRET = QR_SECRET;
    process.env.SUPABASE_URL = SUPABASE_URL;
    service = new TicketDesignService();
  });

  it('génère un token JWT HS256 décodable', () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', endDate);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // structure JWT

    const decoded = jwt.verify(token, QR_SECRET) as any;
    expect(decoded.oid).toBe('oi-1');
    expect(decoded.eid).toBe('ev-1');
    expect(decoded.tid).toBe('tk-1');
  });

  it('calcule exp = event.endDate + 24h', () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', endDate);
    const decoded = jwt.verify(token, QR_SECRET) as any;

    const expectedExp = Math.floor(endDate.getTime() / 1000) + 24 * 3600;
    expect(decoded.exp).toBe(expectedExp);
  });

  it('applique un minimum de 1h si l\'événement est proche/passé', () => {
    const pastEnd = new Date(FIXED_NOW - 2 * 3600 * 1000); // passé
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', pastEnd);
    const decoded = jwt.verify(token, QR_SECRET) as any;

    // exp doit être au moins now + 1h
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(decoded.exp).toBeGreaterThanOrEqual(nowUnix + 3600);
  });

  it('rejette un token signé avec un autre secret (QR_SECRET ≠ JWT_SECRET)', () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', endDate);
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  it('iat est cohérent avec now', () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', endDate);
    const decoded = jwt.verify(token, QR_SECRET) as any;
    const nowUnix = Math.floor(FIXED_NOW / 1000);
    expect(decoded.iat).toBe(nowUnix);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TicketDesignService — verifyQrToken()', () => {
  let service: TicketDesignService;

  beforeEach(() => {
    process.env.QR_SECRET = QR_SECRET;
    process.env.SUPABASE_URL = SUPABASE_URL;
    service = new TicketDesignService();
  });

  it('vérifie et retourne le payload d\'un token valide', () => {
    const endDate = new Date('2026-12-31T23:59:59Z');
    const token = service.generateQrToken('oi-1', 'ev-1', 'tk-1', endDate);

    const result = service.verifyQrToken(token);
    expect(result.valid).toBe(true);
    expect(result.payload?.oid).toBe('oi-1');
    expect(result.payload?.eid).toBe('ev-1');
  });

  it('détecte un token expiré (EXPIRED)', () => {
    // Génère un token déjà expiré
    const expired = jwt.sign(
      { oid: 'oi-1', eid: 'ev-1', tid: 'tk-1', iat: Math.floor(FIXED_NOW / 1000) - 7200, exp: Math.floor(FIXED_NOW / 1000) - 3600 },
      QR_SECRET,
    );
    const result = service.verifyQrToken(expired);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('EXPIRED');
  });

  it('détecte une signature invalide (INVALID)', () => {
    const badToken = jwt.sign({ oid: 'x' }, 'wrong-secret');
    const result = service.verifyQrToken(badToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID');
  });

  it('détecte un token malformé (INVALID)', () => {
    const result = service.verifyQrToken('not-a-jwt');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID');
  });

  it('détecte un token vide (INVALID)', () => {
    const result = service.verifyQrToken('');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('TicketDesignService — buildHtml() [SANITISATION XSS]', () => {
  let service: TicketDesignService;

  beforeEach(() => {
    process.env.QR_SECRET = QR_SECRET;
    process.env.SUPABASE_URL = SUPABASE_URL;
    service = new TicketDesignService();
  });

  const baseParams = {
    designImageUrl: '',
    designBgColor: '#d4ac0d',
    eventName: 'Concert 2026',
    ticketType: 'VIP',
    qrCodeBase64: 'data:image/png;base64,AAAA',
    orderNumber: 'ORD-123',
    clientName: 'Jean Dupont',
    clientPhone: '+228 90 12 34 56',
  };

  it('génère un HTML valide avec les valeurs sanitisées', () => {
    const html = service.buildHtml(baseParams);
    expect(html).toContain('Concert 2026');
    expect(html).toContain('VIP');
    expect(html).toContain('ORD-123');
    expect(html).toContain('#d4ac0d');
  });

  // ─── Tentatives d'injection XSS ──────────────────────────────────────────

  it('neutralise une injection script dans le nom de l\'événement', () => {
    const html = service.buildHtml({
      ...baseParams,
      eventName: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('neutralise une injection script dans le type de billet', () => {
    const html = service.buildHtml({
      ...baseParams,
      ticketType: '<img src=x onerror=alert(1)>',
    });
    // La balise <img> doit être échappée → non exécutable par le navigateur
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&gt;'); // fermeture échappée
  });

  it('neutralise une injection dans le nom du client', () => {
    const html = service.buildHtml({
      ...baseParams,
      clientName: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&quot;&gt;');
  });

  it('neutralise une injection dans le numéro de commande', () => {
    const html = service.buildHtml({
      ...baseParams,
      orderNumber: 'ORD<script>fetch("evil")</script>',
    });
    expect(html).not.toContain('<script>fetch');
  });

  it('rejette une couleur HEX malveillante → couleur par défaut', () => {
    const html = service.buildHtml({
      ...baseParams,
      designBgColor: '#d4ac0d;}</style><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('#d4ac0d'); // fallback
  });

  it('rejette une URL image externe au bucket → pas d\'URL injectée', () => {
    const html = service.buildHtml({
      ...baseParams,
      designImageUrl: 'https://evil.com/hack.png',
    });
    expect(html).not.toContain('evil.com');
  });

  it('rejette une URL data: malveillante', () => {
    const html = service.buildHtml({
      ...baseParams,
      designImageUrl: 'data:text/html,<script>alert(1)</script>',
    });
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('<script>alert(1)');
  });

  it('accepte une URL image dans le bucket autorisé', () => {
    const safeUrl = `${ALLOWED_BASE}billet.png`;
    const html = service.buildHtml({ ...baseParams, designImageUrl: safeUrl });
    expect(html).toContain(safeUrl);
  });

  it('escape les caractères dans le téléphone du client', () => {
    const html = service.buildHtml({
      ...baseParams,
      clientPhone: '<script>steal()</script>',
    });
    expect(html).not.toContain('<script>steal');
  });
});
