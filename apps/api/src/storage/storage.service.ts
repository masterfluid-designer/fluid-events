import { Injectable, Logger } from '@nestjs/common';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
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
 * ⚠️ La construction d'URL publique ci-dessous (`${publicEndpoint}/${bucket}/${key}`)
 * correspond au style RustFS/MinIO en path-style. Un déploiement Supabase
 * Storage en prod peut nécessiter un préfixe différent
 * (`/storage/v1/object/public/...`) — à adapter si besoin le jour venu.
 *
 * ⚠️ `endpoint` (connexion du client S3) et `publicEndpoint` (URLs renvoyées
 * au navigateur) sont volontairement DEUX valeurs distinctes : en Docker,
 * l'API atteint MinIO via le nom de service interne (`http://minio:9000`,
 * résolu par le DNS du réseau Docker), mais ce nom n'existe pas pour le
 * navigateur de l'utilisateur — il lui faut l'URL publique (`http://localhost:9000`
 * en dev, le domaine du bucket en prod). Sans cette distinction, les images
 * uploadées pointent vers une URL injoignable côté client (carré blanc /
 * image cassée) alors que tout fonctionne côté serveur.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicEndpoint: string;
  private bucketEnsured = false;

  constructor() {
    this.endpoint = requireEnv('STORAGE_ENDPOINT');
    this.publicEndpoint = process.env.STORAGE_PUBLIC_ENDPOINT || this.endpoint;
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
    return `${this.publicEndpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
  }

  /**
   * Liste les URLs publiques des objets sous un préfixe ("dossier") du bucket
   * — utilisé pour les logos "confiance"/"paiements" de la landing (décision
   * produit 2026-07-22) : pas de métadonnée en base, on dépose/retire un
   * fichier dans le dossier et le front le récupère en bouclant sur cette liste.
   */
  async listObjectUrls(prefix: string): Promise<{ key: string; url: string }[]> {
    await this.ensureBucket();
    const result = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    const base = `${this.publicEndpoint.replace(/\/$/, '')}/${this.bucket}`;
    return (result.Contents ?? [])
      .filter((obj) => obj.Key && !obj.Key.endsWith('/'))
      .map((obj) => ({ key: obj.Key!, url: `${base}/${obj.Key}` }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Supprime un objet par sa clé complète (ex: "payment-logos/xyz.png"). */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Retrouve la clé S3 d'un objet à partir de son URL publique (inverse de
   * `uploadBuffer`) — `null` si l'URL ne pointe pas vers ce bucket. Utilisé
   * pour copier un fichier déjà uploadé (ex: logo d'événement) vers un autre
   * dossier sans le re-télécharger côté client.
   */
  keyFromPublicUrl(url: string): string | null {
    const base = `${this.publicEndpoint.replace(/\/$/, '')}/${this.bucket}/`;
    return url.startsWith(base) ? url.slice(base.length) : null;
  }

  /** Copie un objet existant vers une nouvelle clé (server-side, sans re-upload) et retourne sa nouvelle URL publique. */
  async copyObject(sourceKey: string, destKey: string): Promise<string> {
    await this.ensureBucket();
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `/${this.bucket}/${sourceKey}`,
        Key: destKey,
      }),
    );
    return `${this.publicEndpoint.replace(/\/$/, '')}/${this.bucket}/${destKey}`;
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
