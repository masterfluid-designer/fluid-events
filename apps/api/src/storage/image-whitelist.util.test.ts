/**
 * Tests unitaires — isAllowedImageUrl (RULES.md §6, whitelist image billet/blocs Builder)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedImageUrl } from './image-whitelist.util';

const ORIGINAL_ENV = { ...process.env };

describe('isAllowedImageUrl', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('avec STORAGE_ENDPOINT/STORAGE_BUCKET configurés (dev RustFS/MinIO)', () => {
    beforeEach(() => {
      process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
      process.env.STORAGE_BUCKET = 'fluid-events';
      delete process.env.SUPABASE_URL;
    });

    it('accepte une URL dans le bucket configuré', () => {
      expect(isAllowedImageUrl('http://localhost:9000/fluid-events/uploads/u1/img.png')).toBe(true);
    });

    it('rejette une URL externe', () => {
      expect(isAllowedImageUrl('https://evil.com/x.png')).toBe(false);
    });

    it("rejette une URL d'un autre bucket sur le même endpoint", () => {
      expect(isAllowedImageUrl('http://localhost:9000/other-bucket/x.png')).toBe(false);
    });

    it('rejette data: et javascript:', () => {
      expect(isAllowedImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
    });
  });

  describe('avec SUPABASE_URL configuré (prod)', () => {
    beforeEach(() => {
      process.env.SUPABASE_URL = 'https://xxxxx.supabase.co';
      delete process.env.STORAGE_ENDPOINT;
      delete process.env.STORAGE_BUCKET;
    });

    it('accepte une URL dans le bucket ticket-designs', () => {
      expect(
        isAllowedImageUrl('https://xxxxx.supabase.co/storage/v1/object/public/ticket-designs/x.png'),
      ).toBe(true);
    });

    it("rejette une URL hors bucket", () => {
      expect(isAllowedImageUrl('https://xxxxx.supabase.co/storage/v1/object/public/other/x.png')).toBe(
        false,
      );
    });
  });

  describe('sans aucune whitelist configurée', () => {
    beforeEach(() => {
      delete process.env.SUPABASE_URL;
      delete process.env.STORAGE_ENDPOINT;
      delete process.env.STORAGE_BUCKET;
    });

    it('rejette tout (aucune base autorisée)', () => {
      expect(isAllowedImageUrl('http://localhost:9000/fluid-events/uploads/u1/img.png')).toBe(false);
    });
  });
});
