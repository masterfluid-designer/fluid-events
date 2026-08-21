/**
 * image-guard — ce que le serveur sait d'un fichier image SANS faire confiance
 * à ce que le client en dit (2026-08-20).
 *
 * Le `mimetype` d'un upload est fourni par le navigateur : il se falsifie en
 * une ligne. Jusqu'ici la whitelist ne regardait que lui — n'importe quel
 * fichier annoncé `image/png` finissait donc dans un bucket public, servi
 * ensuite depuis notre domaine.
 *
 * On lit ici les premiers octets du fichier, qui eux ne mentent pas, puis ses
 * dimensions réelles. Trois formats, ceux du web : PNG, JPEG, WEBP. Pas de
 * SVG (script embarqué = XSS), pas de GIF/BMP/TIFF/HEIC (poids indéfendable ou
 * non lisible par tous les navigateurs), pas d'AVIF — nous ne savons pas en
 * lire les dimensions sans embarquer un décodeur, et laisser passer un format
 * dont on ne peut rien vérifier reviendrait à retirer le garde-fou.
 *
 * Aucune dépendance native : `sharp` imposerait un binaire par plateforme,
 * fragile à installer depuis un poste Windows vers une image Alpine, pour un
 * besoin qui tient en quelques lectures d'octets.
 */

export type FormatImage = 'png' | 'jpeg' | 'webp';

export const EXTENSION_PAR_FORMAT: Record<FormatImage, string> = {
  png: 'png',
  jpeg: 'jpeg',
  webp: 'webp',
};

export const MIME_PAR_FORMAT: Record<FormatImage, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Reconnaît le format à sa signature. Renvoie `null` pour tout le reste — y
 * compris un fichier tronqué, qu'il vaut mieux refuser que stocker à moitié.
 */
export function detecterFormatImage(buffer: Buffer): FormatImage | null {
  if (buffer.length < 16) return null;

  // 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // FF D8 FF — début d'un flux JPEG (SOI + premier marqueur).
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  // "RIFF" …taille… "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }

  return null;
}

/**
 * Dimensions réelles, lues dans l'en-tête. `null` si le fichier est illisible
 * ou tronqué — l'appelant doit alors refuser, jamais supposer.
 */
export function lireDimensions(buffer: Buffer, format: FormatImage): { largeur: number; hauteur: number } | null {
  switch (format) {
    case 'png':
      return lirePng(buffer);
    case 'jpeg':
      return lireJpeg(buffer);
    case 'webp':
      return lireWebp(buffer);
  }
}

/** Le bloc IHDR est toujours le premier : largeur et hauteur en tête de fichier. */
function lirePng(buffer: Buffer): { largeur: number; hauteur: number } | null {
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { largeur: buffer.readUInt32BE(16), hauteur: buffer.readUInt32BE(20) };
}

/**
 * JPEG : il faut parcourir les segments jusqu'au « start of frame », les
 * dimensions n'étant nulle part à position fixe. Les marqueurs sans charge
 * utile (RST, TEM) n'ont pas de longueur — les sauter d'un octet, sinon on
 * lit une longueur qui n'existe pas et on part à la dérive dans le fichier.
 */
function lireJpeg(buffer: Buffer): { largeur: number; hauteur: number } | null {
  let position = 2;

  while (position + 9 < buffer.length) {
    if (buffer[position] !== 0xff) {
      position += 1;
      continue;
    }

    const marqueur = buffer[position + 1];

    if (marqueur === 0xff || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd9)) {
      position += 2;
      continue;
    }

    // SOF0-SOF15, hors DHT (C4), JPG (C8) et DAC (CC) qui partagent la plage.
    const estSof =
      marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;

    if (estSof) {
      return {
        hauteur: buffer.readUInt16BE(position + 5),
        largeur: buffer.readUInt16BE(position + 7),
      };
    }

    const longueur = buffer.readUInt16BE(position + 2);
    if (longueur < 2) return null; // segment incohérent : on ne devine pas
    position += 2 + longueur;
  }

  return null;
}

/**
 * WEBP a trois variantes, et chacune range ses dimensions ailleurs :
 * VP8 (avec pertes), VP8L (sans pertes), VP8X (étendu — animation, alpha).
 */
function lireWebp(buffer: Buffer): { largeur: number; hauteur: number } | null {
  const variante = buffer.toString('ascii', 12, 16);

  if (variante === 'VP8X' && buffer.length >= 30) {
    // Dimensions du canevas, sur 24 bits little-endian, stockées moins un.
    const largeur = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
    const hauteur = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
    return { largeur, hauteur };
  }

  if (variante === 'VP8 ' && buffer.length >= 30) {
    return {
      largeur: buffer.readUInt16LE(26) & 0x3fff,
      hauteur: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (variante === 'VP8L' && buffer.length >= 25) {
    // 14 bits de largeur puis 14 de hauteur, à cheval sur quatre octets.
    const bits = buffer.readUInt32LE(21);
    return {
      largeur: (bits & 0x3fff) + 1,
      hauteur: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}
