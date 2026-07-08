/**
 * Tests unitaires — @saas-events/utils
 * Couvre les mitigations de sécurité critiques du CDC v2.0.0.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDurationToSeconds,
  isValidHexColor,
  sanitizeBgColor,
  buildAllowedImageBase,
  sanitizeImageUrl,
  escapeHtml,
  normalizeCountryCode,
  saveIntent,
  consumeIntent,
  INTENT_TTL_MS,
} from './index';

// ─── Mock Storage pour tests d'intent ─────────────────────────────────────────
class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('parseDurationToSeconds', () => {
  it('parse les secondes', () => {
    expect(parseDurationToSeconds('3600s')).toBe(3600);
  });

  it('parse les minutes', () => {
    expect(parseDurationToSeconds('30m')).toBe(1800);
  });

  it('parse les heures', () => {
    expect(parseDurationToSeconds('2h')).toBe(7200);
  });

  it('parse les jours', () => {
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('retourne 1h (3600s) par défaut pour un format invalide', () => {
    expect(parseDurationToSeconds('invalide')).toBe(3600);
    expect(parseDurationToSeconds('')).toBe(3600);
  });

  it('retourne 1h pour une entrée non-string', () => {
    expect(parseDurationToSeconds(null as any)).toBe(3600);
  });

  it('accepte un nombre sans unité (secondes)', () => {
    expect(parseDurationToSeconds('90')).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('isValidHexColor', () => {
  it('valide un HEX 6 chiffres', () => {
    expect(isValidHexColor('#d4ac0d')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
  });

  it('rejette un HEX 3 chiffres (forme courte)', () => {
    expect(isValidHexColor('#fff')).toBe(false);
  });

  it('rejette les tentatives d\'injection CSS', () => {
    expect(isValidHexColor('#d4ac0d; } body { background: red')).toBe(false);
    expect(isValidHexColor('#000000; expression(alert(1))')).toBe(false);
    expect(isValidHexColor('#;<script>')).toBe(false);
  });

  it('rejette les entrées vides / invalides', () => {
    expect(isValidHexColor('')).toBe(false);
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('#GGGGGG')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sanitizeBgColor', () => {
  it('retourne la couleur si HEX valide', () => {
    expect(sanitizeBgColor('#ff0000')).toBe('#ff0000');
  });

  it('retourne la couleur par défaut #d4ac0d pour une couleur invalide', () => {
    expect(sanitizeBgColor('#abc')).toBe('#d4ac0d');
    expect(sanitizeBgColor('red')).toBe('#d4ac0d');
  });

  it('retourne la couleur par défaut pour null/undefined', () => {
    expect(sanitizeBgColor(null)).toBe('#d4ac0d');
    expect(sanitizeBgColor(undefined)).toBe('#d4ac0d');
  });

  it('bloque l\'injection CSS dans le template billet', () => {
    const malicious = '#000;}</style><script>alert(1)</script>';
    expect(sanitizeBgColor(malicious)).toBe('#d4ac0d');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sanitizeImageUrl', () => {
  const allowedBase = buildAllowedImageBase('https://xxxxx.supabase.co');

  it('construit le bon préfixe de bucket', () => {
    expect(allowedBase).toBe(
      'https://xxxxx.supabase.co/storage/v1/object/public/ticket-designs/',
    );
  });

  it('accepte une URL dans le bucket autorisé', () => {
    const url = `${allowedBase}mon-billet.png`;
    expect(sanitizeImageUrl(url, allowedBase)).toBe(url);
  });

  it('rejette une URL externe au bucket (prévention SSRF/XSS)', () => {
    expect(sanitizeImageUrl('https://evil.com/x.png', allowedBase)).toBe('');
    expect(
      sanitizeImageUrl('https://xxxxx.supabase.co/storage/v1/object/public/other/x.png', allowedBase),
    ).toBe('');
  });

  it('rejette le protocole data: (XSS)', () => {
    expect(
      sanitizeImageUrl('data:text/html,<script>alert(1)</script>', allowedBase),
    ).toBe('');
  });

  it('rejette le protocole javascript: (XSS)', () => {
    expect(
      sanitizeImageUrl('javascript:alert(1)', allowedBase),
    ).toBe('');
  });

  it('rejette une URL malformée', () => {
    expect(sanitizeImageUrl('pas une url', allowedBase)).toBe('');
    expect(sanitizeImageUrl('', allowedBase)).toBe('');
    expect(sanitizeImageUrl(null, allowedBase)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('escapeHtml', () => {
  it('échappe tous les caractères dangereux', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('échappe le symbole &', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('échappe les quotes simples', () => {
    expect(escapeHtml("l'apostrophe")).toBe('l&#39;apostrophe');
  });

  it('retourne une chaîne vide pour null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('ne modifie pas une chaîne sûre', () => {
    expect(escapeHtml('Jean Dupont')).toBe('Jean Dupont');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeCountryCode', () => {
  it('accepte et normalise un code à 2 lettres', () => {
    expect(normalizeCountryCode('tg')).toBe('TG');
    expect(normalizeCountryCode('CI')).toBe('CI');
    expect(normalizeCountryCode('bj')).toBe('BJ');
  });

  it('rejette les codes à 3 lettres ou plus', () => {
    expect(normalizeCountryCode('FRA')).toBe(null);
    expect(normalizeCountryCode('USA')).toBe(null);
  });

  it('rejette les codes avec chiffres/symboles', () => {
    expect(normalizeCountryCode('T1')).toBe(null);
    expect(normalizeCountryCode('T G')).toBe(null);
  });

  it('retourne null pour null/vide', () => {
    expect(normalizeCountryCode(null)).toBe(null);
    expect(normalizeCountryCode('')).toBe(null);
  });
});

// ───────── partagé par saveIntent/consumeIntent ───────────────────────────────
describe('saveIntent / consumeIntent', () => {
  it('saveIntent stocke un intent horodaté avec clé spécifique à l\'événement', () => {
    const storage = new MockStorage();
    saveIntent('concert-2026', 'ticket-123', storage as any);
    const raw = storage.getItem('buy_intent_concert-2026');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.ticketId).toBe('ticket-123');
    expect(typeof parsed.timestamp).toBe('number');
  });

  it('consumeIntent retourne le ticketId et supprime l\'intent (one-shot)', () => {
    const storage = new MockStorage();
    saveIntent('concert-2026', 'ticket-456', storage as any);
    const result = consumeIntent('concert-2026', storage as any);
    expect(result).toEqual({ ticketId: 'ticket-456' });
    // L'intent doit être consommé (supprimé)
    expect(storage.getItem('buy_intent_concert-2026')).toBeNull();
  });

  it('consumeIntent retourne null si pas d\'intent', () => {
    const storage = new MockStorage();
    expect(consumeIntent('concert-2026', storage as any)).toBeNull();
  });

  it('consumeIntent retourne null si l\'intent est expiré (> 30 min)', () => {
    const storage = new MockStorage();
    const baseNow = 1_000_000;
    // save et consume partagent la même horloge injectée pour un test déterministe
    saveIntent('concert-2026', 'ticket-789', storage as any, () => baseNow);
    const future = baseNow + INTENT_TTL_MS + 1; // > 30 min plus tard
    const result = consumeIntent('concert-2026', storage as any, () => future);
    expect(result).toBeNull();
  });

  it('consumeIntent accepte un intent récent (< 30 min)', () => {
    const storage = new MockStorage();
    const baseNow = 5_000_000;
    saveIntent('concert-2026', 'ticket-999', storage as any, () => baseNow);
    const soon = baseNow + 1000; // 1s plus tard
    const result = consumeIntent('concert-2026', storage as any, () => soon);
    expect(result).toEqual({ ticketId: 'ticket-999' });
  });

  it('consumeIntent nettoie un intent corrompu (JSON cassé)', () => {
    const storage = new MockStorage();
    storage.setItem('buy_intent_concert-2026', '{invalid json');
    expect(consumeIntent('concert-2026', storage as any)).toBeNull();
    expect(storage.getItem('buy_intent_concert-2026')).toBeNull();
  });

  it('les intents sont isolés par événement (clés différentes)', () => {
    const storage = new MockStorage();
    saveIntent('event-a', 'ticket-a', storage as any);
    saveIntent('event-b', 'ticket-b', storage as any);
    expect(consumeIntent('event-a', storage as any)).toEqual({ ticketId: 'ticket-a' });
    expect(consumeIntent('event-b', storage as any)).toEqual({ ticketId: 'ticket-b' });
  });
});
