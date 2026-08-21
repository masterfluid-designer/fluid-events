import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, ErrorCodes } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { StorageService } from './storage.service';
import {
  detecterFormatImage,
  lireDimensions,
  EXTENSION_PAR_FORMAT,
  MIME_PAR_FORMAT,
} from './image-guard';

/** Sous-ensemble du fichier multer (mémoire) réellement utilisé ici. */
interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Plafond image ramené de 5 à 3 Mo (2026-08-20). Le navigateur redimensionne
 et recompresse en WEBP avant l'envoi (voir web/lib/image-optimizer.ts) : une
 * photo de 12 Mo part à 300 Ko. 3 Mo laissent donc une marge confortable, et
 * ferment la porte à l'image de 5 Mo servie telle quelle sur mobile — c'est la
 * page publique de l'organisateur qui la paie, en données et en secondes.
 */
const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3 Mo
/**
 * Les vidéos de couverture (hero, bloc vidéo — décision produit 2026-08-17)
 * sont légitimement plus lourdes qu’une image, sans devenir un dépôt de
 * fichiers : 40 Mo couvrent une boucle courte en 1080p, et pas un long
 * métrage sur un VPS à 1 vCPU.
 */
const MAX_VIDEO_SIZE = 40 * 1024 * 1024; // 40 Mo
const MAX_FILE_SIZE = MAX_VIDEO_SIZE;

/**
 * Aucun écran n'a besoin de plus : au-delà, le navigateur du visiteur
 * décompresse en mémoire une image qu’il réduira de toute façon à
 * l'affichage. Le client vise 1920 px ; ce plafond n'est là que pour un envoi
 * direct à l’API, qui ne passe par aucun redimensionnement.
 */
const DIMENSION_MAX = 4000;

/** Jamais de format exotique : ces deux-là couvrent tous les navigateurs cibles. */
const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * Signature de conteneur vidéo. Le mimetype déclaré par le navigateur ne
 * prouve rien : on vérifie que le fichier commence bien comme ce qu'il
 * prétend être.
 */
function estVideoReconnue(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // WEBM/Matroska : entête EBML.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
  // MP4 et dérivés : boîte "ftyp" en quatrième position.
  return buffer.toString('ascii', 4, 8) === 'ftyp';
}

/**
 * Valide une image d'après SON CONTENU et renvoie de quoi la stocker. Le
 * mimetype annoncé n'entre pas dans la décision — il est simplement
 * remplacé par celui du format réellement détecté.
 */
function validerImage(buffer: Buffer, taille: number) {
  const format = detecterFormatImage(buffer);
  if (!format) {
    throw new BadRequestException({
      code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
      message:
        'Format non supporté — PNG, JPEG ou WEBP uniquement (le contenu du fichier ne correspond à aucun de ces formats).',
    });
  }

  if (taille > MAX_IMAGE_SIZE) {
    throw new BadRequestException({
      code: ErrorCodes.DESIGN_IMAGE_TOO_LARGE,
      message: 'Image trop volumineuse (3 Mo maximum).',
    });
  }

  const dimensions = lireDimensions(buffer, format);
  if (!dimensions) {
    throw new BadRequestException({
      code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
      message: 'Image illisible ou incomplète.',
    });
  }

  if (dimensions.largeur > DIMENSION_MAX || dimensions.hauteur > DIMENSION_MAX) {
    throw new BadRequestException({
      code: ErrorCodes.DESIGN_IMAGE_TOO_LARGE,
      message: `Image trop grande (${dimensions.largeur}×${dimensions.hauteur} px) — ${DIMENSION_MAX} px maximum par côté.`,
    });
  }

  return { extension: EXTENSION_PAR_FORMAT[format], mimetype: MIME_PAR_FORMAT[format] };
}
/**
 * Dossiers de logos affichés en boucle sur la landing (décision produit
 * 2026-07-22) : pas de métadonnée en base, déposer/retirer un fichier dans
 * le dossier suffit.
 * Les logos de paiement, eux, sont des assets de marque fixes versionnés
 * dans le dépôt (apps/web/public/images/payment-logos/, voir
 * lib/payment-logos.server.ts côté web) — pas ici, décision produit 2026-07-22.
 */
const MEDIA_FOLDERS = ['trusted-logos'] as const;
type MediaFolder = (typeof MEDIA_FOLDERS)[number];

function assertValidFolder(folder: string): asserts folder is MediaFolder {
  if (!(MEDIA_FOLDERS as readonly string[]).includes(folder)) {
    throw new BadRequestException({
      code: ErrorCodes.MEDIA_FILE_FORMAT_INVALID,
      message: `Dossier inconnu : ${folder} (attendu : ${MEDIA_FOLDERS.join(', ')}).`,
    });
  }
}

/**
 * StorageController — Upload d'image (design billet, blocs Builder), RULES.md §6.
 *
 * Ne fait QUE stocker le fichier et renvoyer son URL publique — c'est cette
 * URL, hébergée sur le bucket whitelisté, qui doit ensuite être fournie à
 * `PATCH /api/tickets/:id` (designImageUrl) ou `PUT /api/builder/:eventId/blocks`
 * (props.imageUrl), tous deux revalidés à l'écriture via `isAllowedImageUrl`.
 *
 * Jamais de SVG (risque XSS via script embarqué) : whitelist stricte PNG/JPEG/WEBP,
 * plus MP4/WEBM pour les médias de couverture (2026-08-17).
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Roles(Role.MANAGER)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(@UploadedFile() file: UploadedImageFile | undefined, @CurrentUser() user: RequestUser) {
    if (!file) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
        message: 'Aucun fichier reçu (champ "file" attendu).',
      });
    }

    /*
     * La vidéo est reconnue à sa signature, l'image aussi (validerImage).
     * Le mimetype annoncé ne sert qu'à savoir quelle famille tester en
     * premier — jamais à autoriser quoi que ce soit.
     */
    const seDitVideo = ALLOWED_VIDEO_TYPES[file.mimetype] !== undefined;

    if (seDitVideo) {
      if (!estVideoReconnue(file.buffer)) {
        throw new BadRequestException({
          code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
          message: 'Vidéo non reconnue — MP4 ou WEBM uniquement.',
        });
      }

      // Plafond par NATURE de fichier : la limite de l’intercepteur vaut pour
      // la vidéo, sans quoi une image de 30 Mo passerait aussi.
      if (file.size > MAX_VIDEO_SIZE) {
        throw new BadRequestException({
          code: ErrorCodes.DESIGN_IMAGE_TOO_LARGE,
          message: 'Vidéo trop volumineuse (40 Mo maximum).',
        });
      }

      const cleVideo = `uploads/${user.id}/${randomUUID()}.${ALLOWED_VIDEO_TYPES[file.mimetype]}`;
      const urlVideo = await this.storageService.uploadBuffer(cleVideo, file.buffer, file.mimetype);
      return { url: urlVideo };
    }

    const { extension, mimetype } = validerImage(file.buffer, file.size);
    const key = `uploads/${user.id}/${randomUUID()}.${extension}`;
    const url = await this.storageService.uploadBuffer(key, file.buffer, mimetype);
    return { url };
  }

  /**
   * GET /api/storage/media-folders/:folder — liste publique (landing) des
   * logos d'un dossier ("payment-logos" | "trusted-logos"). Le front boucle
   * simplement sur `items` pour construire son carrousel/cercle — aucune
   * donnée à synchroniser en base.
   */
  @Public()
  @Get('media-folders/:folder')
  async listMediaFolder(@Param('folder') folder: string) {
    assertValidFolder(folder);
    const items = await this.storageService.listObjectUrls(`${folder}/`);
    return { items };
  }

  /** POST /api/storage/media-folders/:folder — dépose un logo (Super Admin). */
  @Roles(Role.SUPER_ADMIN)
  @Post('media-folders/:folder')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadToMediaFolder(
    @Param('folder') folder: string,
    @UploadedFile() file: UploadedImageFile | undefined,
  ) {
    assertValidFolder(folder);

    if (!file) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
        message: 'Aucun fichier reçu (champ "file" attendu).',
      });
    }

    // Dépôt de logos : images UNIQUEMENT, et plafond image — la limite
    // relevée pour les vidéos de couverture ne doit pas s’appliquer ici.
    const { extension, mimetype } = validerImage(file.buffer, file.size);

    const key = `${folder}/${randomUUID()}.${extension}`;
    const url = await this.storageService.uploadBuffer(key, file.buffer, mimetype);
    return { key, url };
  }

  /**
   * DELETE /api/storage/media-folders/:folder?key=... — retire un logo
   * (Super Admin). `key` doit être la clé complète retournée par l'upload
   * (préfixée par le dossier), jamais construite côté client à la main.
   */
  @Roles(Role.SUPER_ADMIN)
  @Delete('media-folders/:folder')
  async deleteFromMediaFolder(@Param('folder') folder: string, @Query('key') key: string) {
    assertValidFolder(folder);

    if (!key || !key.startsWith(`${folder}/`)) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
        message: 'Paramètre "key" manquant ou invalide pour ce dossier.',
      });
    }

    await this.storageService.deleteObject(key);
    return { deleted: true };
  }
}
