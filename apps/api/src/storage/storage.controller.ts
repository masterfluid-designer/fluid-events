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

/** Sous-ensemble du fichier multer (mémoire) réellement utilisé ici. */
interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};

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
 * Jamais de SVG (risque XSS via script embarqué) : whitelist stricte PNG/JPEG/WEBP.
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

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
        message: 'Format non supporté — PNG, JPEG ou WEBP uniquement.',
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_TOO_LARGE,
        message: 'Image trop volumineuse (5 Mo maximum).',
      });
    }

    const key = `uploads/${user.id}/${randomUUID()}.${extension}`;
    const url = await this.storageService.uploadBuffer(key, file.buffer, file.mimetype);
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

    const extension = ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_FORMAT_INVALID,
        message: 'Format non supporté — PNG, JPEG ou WEBP uniquement.',
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        code: ErrorCodes.DESIGN_IMAGE_TOO_LARGE,
        message: 'Image trop volumineuse (5 Mo maximum).',
      });
    }

    const key = `${folder}/${randomUUID()}.${extension}`;
    const url = await this.storageService.uploadBuffer(key, file.buffer, file.mimetype);
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
