import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * StorageService — Upload vers un stockage S3-compatible (CDC ADR §5).
 *
 * Même client pour RustFS/MinIO en dev et Supabase Storage en prod — seule la
 * config (`STORAGE_*` en env) change. Pas de dépendance directe à un SDK
 * propriétaire, uniquement `@aws-sdk/client-s3` (protocole S3 standard).
 *
 * ⚠️ La construction d'URL publique ci-dessous (`${endpoint}/${bucket}/${key}`)
 * correspond au style RustFS/MinIO en path-style. Un déploiement Supabase
 * Storage en prod peut nécessiter un préfixe différent
 * (`/storage/v1/object/public/...`) — à adapter si besoin le jour venu.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private bucketEnsured = false;

  constructor() {
    this.endpoint = requireEnv('STORAGE_ENDPOINT');
    const accessKeyId = requireEnv('STORAGE_ACCESS_KEY');
    const secretAccessKey = requireEnv('STORAGE_SECRET_KEY');
    this.bucket = requireEnv('STORAGE_BUCKET');

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: process.env.STORAGE_REGION || 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: process.env.STORAGE_USE_PATH_STYLE_ENDPOINT !== 'false',
    });
  }

  /** Upload un buffer et retourne son URL publique. */
  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }

  /**
   * Crée le bucket s'il n'existe pas encore (confort dev — RustFS/MinIO ne
   * provisionnent pas de bucket par défaut) et s'assure qu'il est lisible
   * publiquement (billets/QR consultés directement par URL, sans auth S3).
   * Best-effort : une erreur ici ne doit pas empêcher de réessayer l'upload,
   * qui échouera avec une erreur plus explicite si le bucket manque réellement.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket ${this.bucket} créé.`);
      } catch (err) {
        this.logger.warn(
          `Impossible de vérifier/créer le bucket ${this.bucket} : ${(err as Error).message}`,
        );
      }
    }
    await this.ensurePublicReadPolicy();
    this.bucketEnsured = true;
  }

  /**
   * Applique une policy public-read (lecture seule, `s3:GetObject`) sur le
   * bucket. Best-effort : certains backends (ex. Supabase Storage, dont les
   * buckets publics se configurent via son propre dashboard) peuvent ne pas
   * supporter cet appel S3 brut — on log un warning plutôt que de planter.
   */
  private async ensurePublicReadPolicy(): Promise<void> {
    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${this.bucket}/*`],
              },
            ],
          }),
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Impossible d'appliquer la policy public-read sur ${this.bucket} : ${(err as Error).message}`,
      );
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant — StorageService ne peut pas démarrer (voir .env).`);
  }
  return value;
}
