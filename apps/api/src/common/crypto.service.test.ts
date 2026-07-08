/**
 * Tests unitaires — CryptoService
 * Chiffrement AES-256-GCM des clés API paiement (CDC §15.2).
 * Propriétés testées :
 *  - réversibilité (encrypt → decrypt)
 *  - caractère non-déterministe (IV aléatoire → 2 chiffrements diffèrent)
 *  - intégrité (tag d'authentification GCM)
 *  - rejet des clés invalides
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './crypto.service';

// Clé de test valide : 32 bytes en hex (64 caractères)
const VALID_KEY_HEX = 'a'.repeat(64);
// Clé trop courte (16 bytes)
const SHORT_KEY_HEX = 'a'.repeat(32);

describe('CryptoService', () => {
  let crypto: CryptoService;

  beforeEach(() => {
    crypto = new CryptoService(VALID_KEY_HEX);
  });

  describe('constructeur / validation de clé', () => {
    it('accepte une clé de 32 bytes (64 hex)', () => {
      expect(() => new CryptoService(VALID_KEY_HEX)).not.toThrow();
    });

    it('rejette une clé trop courte (< 32 bytes)', () => {
      expect(() => new CryptoService(SHORT_KEY_HEX)).toThrow(/ENCRYPTION_KEY/i);
    });

    it('rejette une clé non-hex', () => {
      expect(() => new CryptoService('z'.repeat(64))).toThrow(/ENCRYPTION_KEY/i);
    });
  });

  describe('encrypt / decrypt — réversibilité', () => {
    it('déchiffre correctement un message chiffré', () => {
      const plaintext = 'sk_live_KKIAPAY_SECRET_KEY_12345';
      const ciphertext = crypto.encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext); // réellement chiffré
      expect(crypto.decrypt(ciphertext)).toBe(plaintext);
    });

    it('gère les caractères Unicode / accents', () => {
      const plaintext = 'Clé accentuée — éàüΩ🎉';
      expect(crypto.decrypt(crypto.encrypt(plaintext))).toBe(plaintext);
    });

    it('gère une chaîne vide', () => {
      expect(crypto.decrypt(crypto.encrypt(''))).toBe('');
    });

    it('gère les longs secrets API', () => {
      const plaintext = 'x'.repeat(10_000);
      expect(crypto.decrypt(crypto.encrypt(plaintext))).toBe(plaintext);
    });
  });

  describe('non-déterminisme (IV aléatoire)', () => {
    it('deux chiffrements du même plaintext diffèrent', () => {
      const plaintext = 'same-secret';
      const c1 = crypto.encrypt(plaintext);
      const c2 = crypto.encrypt(plaintext);
      expect(c1).not.toBe(c2); // IV différent → ciphertext différent
      // Mais les deux déchiffrent vers la même valeur
      expect(crypto.decrypt(c1)).toBe(plaintext);
      expect(crypto.decrypt(c2)).toBe(plaintext);
    });
  });

  describe('format de sortie', () => {
    it('produit un format iv:tag:encrypted', () => {
      const ciphertext = crypto.encrypt('test');
      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(3);
      // IV (16 bytes = 32 hex), tag (16 bytes = 32 hex), encrypted (variable)
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('intégrité GCM (tag d\'authentification)', () => {
    it('rejette un ciphertext dont le tag est altéré', () => {
      const ciphertext = crypto.encrypt('secret');
      const [iv, tag, enc] = ciphertext.split(':');
      // Corrompt le tag
      const corruptedTag = tag.slice(0, -2) + 'ff';
      const corrupted = `${iv}:${corruptedTag}:${enc}`;
      expect(() => crypto.decrypt(corrupted)).toThrow();
    });

    it('rejette un ciphertext dont le contenu chiffré est altéré', () => {
      const ciphertext = crypto.encrypt('secret');
      const [iv, tag, enc] = ciphertext.split(':');
      const corruptedEnc = enc.slice(0, -2) + 'ff';
      const corrupted = `${iv}:${tag}:${corruptedEnc}`;
      expect(() => crypto.decrypt(corrupted)).toThrow();
    });

    it('rejette un ciphertext dont l\'IV est altéré', () => {
      const ciphertext = crypto.encrypt('secret');
      const [iv, tag, enc] = ciphertext.split(':');
      const corruptedIv = iv.slice(0, -2) + 'ff';
      const corrupted = `${corruptedIv}:${tag}:${enc}`;
      expect(() => crypto.decrypt(corrupted)).toThrow();
    });
  });

  describe('erreurs de format', () => {
    it('rejette un ciphertext mal formé', () => {
      expect(() => crypto.decrypt('not-valid')).toThrow();
      expect(() => crypto.decrypt('a:b')).toThrow();
      expect(() => crypto.decrypt('')).toThrow();
    });
  });

  describe('séparation des instances (clés différentes)', () => {
    it('deux instances avec des clés différentes ne peuvent pas déchiffrer entre elles', () => {
      const cryptoA = new CryptoService('a'.repeat(64));
      const cryptoB = new CryptoService('b'.repeat(64));
      const ciphertext = cryptoA.encrypt('secret');
      expect(() => cryptoB.decrypt(ciphertext)).toThrow();
    });
  });
});
