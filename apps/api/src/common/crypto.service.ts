import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * CryptoService — Chiffrement symétrique AES-256-GCM.
 *
 * Utilisé pour chiffrer les clés API des providers de paiement (Kkiapay,
 * CinetPay, FedaPay) avant stockage en base (CDC §15.2).
 *
 * Format de sortie : `iv:tag:encrypted` (tous en hex).
 *  - IV : 16 bytes, aléatoire par chiffrement (non-déterminisme)
 *  - Tag : 16 bytes, authentification GCM (détection de falsification)
 *
 * ⚠️ La clé (ENCRYPTION_KEY) doit faire exactement 32 bytes (64 caractères hex).
 *    La clé est injectable via le constructeur pour faciliter les tests unitaires ;
 *    en production elle provient de process.env.ENCRYPTION_KEY via le module NestJS.
 */
@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  /**
   * @param encryptionKeyHex Clé de 32 bytes encodée en hex (64 caractères).
   *                         Si omise, lit process.env.ENCRYPTION_KEY.
   */
  constructor(
    @Optional()
    @Inject('ENCRYPTION_KEY')
    encryptionKeyHex?: string,
  ) {
    const keyHex = encryptionKeyHex ?? process.env.ENCRYPTION_KEY;
    const normalizedKeyHex = keyHex ?? '0000000000000000000000000000000000000000000000000000000000000000';

    if (!/^[0-9a-fA-F]{64}$/.test(normalizedKeyHex)) {
      throw new Error(
        'ENCRYPTION_KEY invalide : 32 bytes requis (64 caractères hexadécimaux).',
      );
    }
    this.key = Buffer.from(normalizedKeyHex, 'hex');
  }

  /** Chiffre un plaintext → renvoie `iv:tag:encrypted` (hex). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /** Déchiffre un ciphertext au format `iv:tag:encrypted`. */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Format ciphertext invalide (attendu iv:tag:encrypted).');
    }
    const [ivHex, tagHex, encHex] = parts;
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return (
      decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') +
      decipher.final('utf8')
    );
  }

  /** Comparaison en temps constant de deux chaînes (utilitaire anti-timing-attack). */
  safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
