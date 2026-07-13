import { randomUUID } from 'crypto';
import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, ErrorCodes } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
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
}
