/**
 * Optimisation des images AVANT envoi (2026-08-20).
 *
 * Un organisateur dépose la photo que lui a rendue son graphiste : 4000 px de
 * large, 8 Mo, en PNG. Elle finissait telle quelle sur la page publique, où
 * chaque visiteur la téléchargeait en entier — sur un forfait data, à Lomé ou
 * à Cotonou, cette seule image coûte plus cher que tout le reste de la page.
 *
 * Le navigateur sait faire le travail : redimensionner et recompresser ici
 * évite d'installer un décodeur natif côté serveur, et l'envoi part déjà léger
 * au lieu de traverser le réseau deux fois.
 *
 * Ce n'est PAS une garantie — un client peut toujours appeler l'API
 * directement. C'est le serveur qui refuse ce qui dépasse (voir
 * api/src/storage/image-guard.ts). Ici on rend le cas normal léger.
 */

/**
 * 1920 px couvre un affichage plein écran sur la quasi-totalité des écrans, y
 * compris en densité double pour une image qui n'occupe que la moitié de la
 * largeur. Au-delà, on ferait payer au visiteur des pixels que son écran ne
 * peut pas montrer.
 */
const COTE_MAX = 1920;

/**
 * 0,82 : au-dessus, le poids grimpe sans gain visible ; en dessous, les
 * aplats de couleur d'une affiche commencent à se marbrer.
 */
const QUALITE_WEBP = 0.82;

/**
 * En dessous, on ne touche à rien : le gain absolu serait de quelques dizaines
 * de kilo-octets, alors qu’un ré-encodage avec pertes abîme les bords nets
 * d'un logo ou d'un pictogramme. Au-dessus, le poids justifie le passage.
 */
const SEUIL_INTACT = 48 * 1024;

export async function optimiserImage(fichier: File): Promise<File> {
  // Les vidéos passent intactes : les recompresser demanderait un encodeur,
  // et un canevas n'en garderait qu'une image fixe.
  if (!fichier.type.startsWith('image/')) return fichier;

  // Un navigateur trop ancien pour ces deux-là enverra l'original ; le serveur
  // tranchera. Mieux vaut un envoi refusé qu'une exception au clic.
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return fichier;

  try {
    // `from-image` : sans cela une photo prise au téléphone perd son
    // orientation EXIF en passant par le canevas, et arrive couchée.
    const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    const plusGrandCote = Math.max(bitmap.width, bitmap.height);
    const ratio = Math.min(1, COTE_MAX / plusGrandCote);

    if (ratio === 1 && fichier.size <= SEUIL_INTACT) {
      bitmap.close();
      return fichier;
    }

    const largeur = Math.round(bitmap.width * ratio);
    const hauteur = Math.round(bitmap.height * ratio);

    const canevas = document.createElement('canvas');
    canevas.width = largeur;
    canevas.height = hauteur;
    const contexte = canevas.getContext('2d');
    if (!contexte) {
      bitmap.close();
      return fichier;
    }

    contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resoudre) =>
      canevas.toBlob(resoudre, 'image/webp', QUALITE_WEBP),
    );

    // `toBlob` retombe silencieusement sur PNG quand le format demandé n'est
    // pas gérable : sans cette vérification, on enverrait un PNG plus lourd
    // que l'original en croyant l'avoir allégé.
    if (!blob || blob.type !== 'image/webp') return fichier;

    // Une petite image déjà bien compressée peut grossir en WEBP. Le
    // redimensionnement, lui, vaut toujours le coup : on ne garde l'original
    // que si l'on n'a rien réduit.
    if (blob.size >= fichier.size && ratio === 1) return fichier;

    return new File([blob], `${nomSansExtension(fichier.name)}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    // Image corrompue, format que le navigateur ne décode pas : on laisse le
    // serveur répondre, il a le message d'erreur juste.
    return fichier;
  }
}

function nomSansExtension(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(0, point) : nom;
}
