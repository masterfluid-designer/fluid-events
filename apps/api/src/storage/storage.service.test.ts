/**
 * Tests unitaires — StorageService
 * Upload S3-compatible (RustFS/MinIO dev, Supabase Storage prod — CDC ADR §5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';

const ENV_KEYS = [
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
  'STORAGE_REGION',
  'STORAGE_USE_PATH_STYLE_ENDPOINT',
] as const;

function setStorageEnv() {
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
  process.env.STORAGE_ACCESS_KEY = 'minioadmin';
  process.env.STORAGE_SECRET_KEY = 'minioadmin';
  process.env.STORAGE_BUCKET = 'fluid-events';
}

describe('StorageService', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    vi.restoreAllMocks();
  });

  it('lève une erreur explicite si une variable STORAGE_* requise est absente', async () => {
    delete process.env.STORAGE_ENDPOINT;
    const { StorageService } = await import('./storage.service');
    expect(() => new StorageService()).toThrow(/STORAGE_ENDPOINT/);
  });

  it('uploadBuffer() envoie un PutObjectCommand et retourne une URL publique', async () => {
    setStorageEnv();
    const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const { StorageService } = await import('./storage.service');
    const service = new StorageService();

    const url = await service.uploadBuffer('tickets/oi-1.pdf', Buffer.from('pdf-bytes'), 'application/pdf');

    expect(url).toBe('http://localhost:9000/fluid-events/tickets/oi-1.pdf');
    // 1er appel = HeadBucketCommand, 2e = PutBucketPolicyCommand (ensureBucket), 3e = PutObjectCommand
    expect(sendSpy).toHaveBeenCalledTimes(3);
    const putCommand = sendSpy.mock.calls[2][0] as any;
    expect(putCommand.input).toEqual({
      Bucket: 'fluid-events',
      Key: 'tickets/oi-1.pdf',
      Body: Buffer.from('pdf-bytes'),
      ContentType: 'application/pdf',
    });
  });

  it('applique une policy public-read (s3:GetObject) sur le bucket', async () => {
    setStorageEnv();
    const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const { StorageService } = await import('./storage.service');
    const service = new StorageService();

    await service.uploadBuffer('tickets/oi-1.pdf', Buffer.from('x'), 'application/pdf');

    const policyCommand = sendSpy.mock.calls[1][0] as any;
    expect(policyCommand.input.Bucket).toBe('fluid-events');
    const policy = JSON.parse(policyCommand.input.Policy);
    expect(policy.Statement[0]).toEqual(
      expect.objectContaining({ Effect: 'Allow', Action: ['s3:GetObject'] }),
    );
  });

  it('crée le bucket si HeadBucket échoue (bucket absent)', async () => {
    setStorageEnv();
    const sendSpy = vi
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValueOnce(new Error('NotFound')) // HeadBucketCommand
      .mockResolvedValueOnce({} as never) // CreateBucketCommand
      .mockResolvedValueOnce({} as never) // PutBucketPolicyCommand
      .mockResolvedValueOnce({} as never); // PutObjectCommand
    const { StorageService } = await import('./storage.service');
    const service = new StorageService();

    await service.uploadBuffer('tickets/oi-2.pdf', Buffer.from('x'), 'application/pdf');

    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it("ne réessaie pas de vérifier le bucket à chaque upload (mise en cache après le premier succès)", async () => {
    setStorageEnv();
    const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    const { StorageService } = await import('./storage.service');
    const service = new StorageService();

    await service.uploadBuffer('a.pdf', Buffer.from('a'), 'application/pdf');
    await service.uploadBuffer('b.pdf', Buffer.from('b'), 'application/pdf');

    // 2 uploads = 1 HeadBucket + 1 PutBucketPolicy (mis en cache) + 2 PutObject = 4 appels
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });
});
