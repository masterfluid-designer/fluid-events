/**
 * Utilitaires média partagés (décision produit 2026-08-17).
 *
 * Dans `lib/` et non à côté de la page publique : le champ d'upload du
 * Builder, le hero et le bloc vidéo posent tous la même question.
 */

/** Formats d'affiche proposés à l'organisateur. */
export type MediaAspect = '4:5' | '1:1' | '9:16' | '16:9';

export const MEDIA_ASPECT_CLASS: Record<MediaAspect, string> = {
  '4:5': 'aspect-[4/5]',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
};

export const MEDIA_ASPECT_LABEL: Record<MediaAspect, string> = {
  '4:5': 'Portrait 4:5',
  '1:1': 'Carré 1:1',
  '9:16': 'Story 9:16',
  '16:9': 'Paysage 16:9',
};

/**
 * Reconnaît une vidéo à son extension. Le stockage n'expose pas de type MIME
 * sur l'URL publique, et l'upload n'accepte que ces deux formats — inutile
 * d'aller chercher plus loin.
 */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm)(\?|$)/i.test(url);
}
