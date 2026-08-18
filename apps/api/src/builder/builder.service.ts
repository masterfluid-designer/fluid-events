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
import { sanitizeBlockHtml } from './html-sanitizer.util';

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
      // On remonte le premier message de Zod plutôt qu'un « structure
      // invalide » opaque : la règle d'unicité nomme le bloc fautif, et sans
      // ça l'organisateur n'a aucun moyen de savoir quoi corriger.
      const premier = parsed.error.issues[0]?.message;
      throw new BadRequestException({
        code: ErrorCodes.BUILDER_SCHEMA_INVALID,
        message: premier ? `Structure de blocs invalide — ${premier}` : 'Structure de blocs invalide.',
        issues: parsed.error.issues,
      });
    }

    // Whitelist d'URL (RULES.md §6) — toute image référencée dans les props
    // d'un bloc doit pointer vers un stockage whitelisté, jamais une URL externe.
    for (const block of parsed.data.blocks) {
      // `mediaUrl`/`posterUrl` (hero et bloc vidéo, 2026-08-17) passent le MÊME
      // contrôle : `isAllowedImageUrl` vérifie l’ORIGINE, pas le type de
      // fichier — une vidéo hébergée ailleurs est aussi indésirable qu’une
      // image, et une URL externe dans un <video> reste une fuite de
      // référent chez le visiteur.
      for (const key of ["imageUrl", "mediaUrl", "posterUrl"] as const) {
        const url = block.props[key];
        if (typeof url === 'string' && url && !isAllowedImageUrl(url)) {
          throw new BadRequestException({
            code: ErrorCodes.BUILDER_SCHEMA_INVALID,
            message: `Bloc "${block.id}" : URL de média non autorisée — utilisez POST /api/storage/upload.`,
          });
        }
      }
      // Bloc HTML (décision produit 2026-07-13) : nettoyé AVANT persistance,
      // jamais au seul rendu — la page publique fait ensuite confiance à ce
      // qui est en base (dangerouslySetInnerHTML côté BlockRenderer).
      if (block.type === 'html' && typeof block.props.htmlContent === 'string') {
        block.props.htmlContent = sanitizeBlockHtml(block.props.htmlContent);
      }
    }

    // L'image de FOND de la page (thème, 2026-08-18) passe exactement la même
    // garde que les images de blocs : elle part dans un `url()` CSS chez chaque
    // visiteur, une origine externe y serait à la fois une fuite de référent et
    // un vecteur d'injection. Une chaîne vide est le geste « retirer l'image »,
    // et n'a donc rien à valider.
    const backgroundImageUrl = parsed.data.theme?.backgroundImageUrl;
    if (backgroundImageUrl && !isAllowedImageUrl(backgroundImageUrl)) {
      throw new BadRequestException({
        code: ErrorCodes.BUILDER_SCHEMA_INVALID,
        message:
          "Image de fond : URL non autorisée — utilisez POST /api/storage/upload.",
      });
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
    // `theme` absent du corps = sauvegarde de blocs seule : on laisse le thème
    // existant intact plutôt que de le réinitialiser (`undefined` est ignoré
    // par Prisma, contrairement à `null` qui écraserait).
    const themeJson =
      parsed.data.theme === undefined
        ? undefined
        : (parsed.data.theme as unknown as InputJsonValue);

    return this.prisma.eventPage.upsert({
      where: { eventId },
      create: { eventId, blocks: blocksJson, theme: themeJson ?? {} },
      update: { blocks: blocksJson, theme: themeJson },
    });
  }
}
