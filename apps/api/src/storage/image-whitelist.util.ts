import { buildAllowedImageBase, buildAllowedStorageBase, sanitizeImageUrl } from '@saas-events/utils';

/**
 * Vérifie qu'une URL d'image (design billet, blocs Builder) pointe vers un
 * stockage whitelisté (RULES.md §6) : le bucket Supabase Storage en prod
 * (`SUPABASE_URL`) et/ou le stockage S3-compatible configuré (`STORAGE_*` —
 * RustFS/MinIO en dev, ou Supabase via son endpoint S3). Les deux bases sont
 * vérifiées quand elles sont configurées, pour ne pas casser un environnement
 * qui n'utilise que l'une des deux.
 */
export function isAllowedImageUrl(url: string): boolean {
  const bases: string[] = [];
  if (process.env.SUPABASE_URL) {
    bases.push(buildAllowedImageBase(process.env.SUPABASE_URL));
  }
  if (process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET) {
    bases.push(buildAllowedStorageBase(process.env.STORAGE_ENDPOINT, process.env.STORAGE_BUCKET));
  }
  return bases.some((base) => sanitizeImageUrl(url, base) !== '');
}
