import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InputJsonValue } from '@prisma/client/runtime/library';
import { ErrorCodes } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { SaveBlocksDto } from './blocks.schema';
import { detectConcurrencyConflict } from './builder.concurrency';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';

/**
 * BuilderService — orchestration de la sauvegarde des blocs Event Builder
 * (CDC §11). Ownership dérivée du JWT (RULES.md §1) : `eventId` vient de
 * l'URL mais n'est jamais fait confiance sans vérifier `event.managerId`.
 */
@Injectable()
export class BuilderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Page builder de l'événement du manager authentifié (CDC §1.4 : 1 Manager = 1 Event). */
  async getMyBlocks(managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { managerId },
      select: { id: true, eventPage: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }

    return {
      eventId: event.id,
      blocks: event.eventPage?.blocks ?? [],
      theme: event.eventPage?.theme ?? {},
      isPublished: event.eventPage?.isPublished ?? false,
      updatedAt: event.eventPage?.updatedAt ?? null,
    };
  }

  /**
   * Sauvegarde les blocs (`PUT /api/builder/:eventId/blocks`) :
   * ownership → validation Zod → concurrence optimiste → upsert atomique.
   */
  async saveBlocks(eventId: string, managerId: string, body: unknown) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, managerId: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }
    if (event.managerId !== managerId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Vous n'êtes pas le gestionnaire de cet événement.",
      });
    }

    const parsed = SaveBlocksDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: ErrorCodes.BUILDER_SCHEMA_INVALID,
        message: 'Structure de blocs invalide.',
        issues: parsed.error.issues,
      });
    }

    // Whitelist d'URL (RULES.md §6) — toute image référencée dans les props
    // d'un bloc doit pointer vers un stockage whitelisté, jamais une URL externe.
    for (const block of parsed.data.blocks) {
      const imageUrl = block.props.imageUrl;
      if (typeof imageUrl === 'string' && imageUrl && !isAllowedImageUrl(imageUrl)) {
        throw new BadRequestException({
          code: ErrorCodes.BUILDER_SCHEMA_INVALID,
          message: `Bloc "${block.id}" : URL d'image non autorisée — utilisez POST /api/storage/upload.`,
        });
      }
    }

    const existingPage = await this.prisma.eventPage.findUnique({
      where: { eventId },
      select: { updatedAt: true },
    });

    if (
      existingPage &&
      detectConcurrencyConflict(existingPage.updatedAt, parsed.data.lastKnownUpdatedAt)
    ) {
      throw new ConflictException({
        code: ErrorCodes.BUILDER_CONFLICT,
        message: 'Cette page a été modifiée entre-temps par une autre session — rechargez avant de réessayer.',
      });
    }

    const blocksJson = parsed.data.blocks as unknown as InputJsonValue;

    return this.prisma.eventPage.upsert({
      where: { eventId },
      create: { eventId, blocks: blocksJson },
      update: { blocks: blocksJson },
    });
  }
}
