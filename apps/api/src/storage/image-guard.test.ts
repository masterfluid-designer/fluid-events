import { describe, it, expect } from 'vitest';
import { detecterFormatImage, lireDimensions } from './image-guard';

/**
 * Les fichiers sont construits ici octet par octet : un vrai PNG de test
 * cacherait ce que la fonction lit réellement, et un fichier binaire dans le
 * dépôt ne dit rien de ce qu'il vérifie.
 */

function png(largeur: number, hauteur: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(largeur, 16);
  buffer.writeUInt32BE(hauteur, 20);
  return buffer;
}

/** JPEG minimal : SOI, un segment APP0 à sauter, puis le SOF0 à trouver. */
function jpeg(largeur: number, hauteur: number): Buffer {
  const app0 = Buffer.alloc(20);
  app0.writeUInt8(0xff, 0);
  app0.writeUInt8(0xe0, 1);
  app0.writeUInt16BE(18, 2); // longueur du segment, y compris ces deux octets

  const sof = Buffer.alloc(11);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1);
  sof.writeUInt16BE(9, 2);
  sof.writeUInt8(8, 4); // précision
  sof.writeUInt16BE(hauteur, 5);
  sof.writeUInt16BE(largeur, 7);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

function webpVp8x(largeur: number, hauteur: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  const l = largeur - 1;
  const h = hauteur - 1;
  buffer[24] = l & 0xff;
  buffer[25] = (l >> 8) & 0xff;
  buffer[26] = (l >> 16) & 0xff;
  buffer[27] = h & 0xff;
  buffer[28] = (h >> 8) & 0xff;
  buffer[29] = (h >> 16) & 0xff;
  return buffer;
}

function webpVp8(largeur: number, hauteur: number): Buffer {
  const buffer = Buffer.alloc(32);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt16LE(largeur, 26);
  buffer.writeUInt16LE(hauteur, 28);
  return buffer;
}

describe('detecterFormatImage', () => {
  it('reconnaît PNG, JPEG et WEBP à leur signature', () => {
    expect(detecterFormatImage(png(10, 10))).toBe('png');
    expect(detecterFormatImage(jpeg(10, 10))).toBe('jpeg');
    expect(detecterFormatImage(webpVp8x(10, 10))).toBe('webp');
  });

  it('refuse un exécutable renommé en image — le mimetype déclaré ne prouve rien', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    expect(detecterFormatImage(exe)).toBeNull();
  });

  it('refuse un SVG, malgré son type image/*', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(detecterFormatImage(svg)).toBeNull();
  });

  it('refuse GIF et BMP, hors du périmètre web retenu', () => {
    expect(detecterFormatImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]))).toBeNull();
    expect(detecterFormatImage(Buffer.concat([Buffer.from('BM'), Buffer.alloc(32)]))).toBeNull();
  });

  it('refuse un fichier tronqué plutôt que de le stocker à moitié', () => {
    expect(detecterFormatImage(Buffer.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe('lireDimensions', () => {
  it('lit un PNG', () => {
    expect(lireDimensions(png(1920, 1080), 'png')).toEqual({ largeur: 1920, hauteur: 1080 });
  });

  it('lit un JPEG en sautant les segments qui précèdent le SOF', () => {
    expect(lireDimensions(jpeg(4200, 3150), 'jpeg')).toEqual({ largeur: 4200, hauteur: 3150 });
  });

  it('lit les deux variantes WEBP', () => {
    expect(lireDimensions(webpVp8x(2400, 1600), 'webp')).toEqual({ largeur: 2400, hauteur: 1600 });
    expect(lireDimensions(webpVp8(800, 600), 'webp')).toEqual({ largeur: 800, hauteur: 600 });
  });

  it("renvoie null quand l'en-tête est illisible — l'appelant doit refuser, pas supposer", () => {
    const pngSansIhdr = png(10, 10);
    pngSansIhdr.write('XXXX', 12, 'ascii');
    expect(lireDimensions(pngSansIhdr, 'png')).toBeNull();

    // JPEG dont aucun segment n'est un SOF : rien à en tirer.
    const sansSof = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40)]);
    expect(lireDimensions(sansSof, 'jpeg')).toBeNull();
  });

  it('ne part pas à la dérive sur un segment JPEG de longueur incohérente', () => {
    const brise = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(40)]);
    brise.writeUInt8(0xff, 2);
    brise.writeUInt8(0xe0, 3);
    brise.writeUInt16BE(0, 4); // longueur nulle : impossible
    expect(lireDimensions(brise, 'jpeg')).toBeNull();
  });
});
