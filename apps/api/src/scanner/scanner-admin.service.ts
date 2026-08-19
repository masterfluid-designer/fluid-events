import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Role, ErrorCodes } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EmailService } from '../notifications/email.service';

const INVITE_TOKEN_TTL_DAYS = 7;
const FRONTEND_URL = process.env.APP_URL ?? 'http://localhost:3000';

/**
 * ScannerAdminService — gestion des comptes scanner par le Manager
 * (décision produit 2026-08-19).
 *
 * Jusqu'ici aucun endpoint ne créait de scanner : ils ne naissaient que du
 * script de seed. Un organisateur ne pouvait donc pas ouvrir sa billetterie
 * le jour J — les billets vendus étaient invérifiables à l'entrée.
 *
 * Deux chemins, parce que deux situations réelles :
 *  - INVITER quelqu'un qui n'a pas de compte (un agent recruté pour la
 *    soirée) : on crée le compte et on lui envoie un lien pour choisir son
 *    mot de passe, exactement comme l'invitation d'un Manager ;
 *  - PROMOUVOIR un compte existant (un bénévole qui a déjà acheté sa place).
 *
 * ⚠️ Un utilisateur n'a qu'UN rôle. Promouvoir un client le fait donc passer
 * en SCANNER, et il perd l'accès à ses propres billets (`/api/payments/orders`
 * est réservé au rôle CLIENT). L'opération est réversible : retirer le
 * scanner rend son rôle d'origine.
 */
@Injectable()
export class ScannerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Événement du manager — 1 Manager = 1 Event (CDC §1.4). */
  private async getMyEventOrThrow(managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { managerId },
      select: { id: true, title: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Aucun événement associé à ce compte manager.',
      });
    }
    return event;
  }

  async list(managerId: string) {
    const event = await this.getMyEventOrThrow(managerId);
    const scanners = await this.prisma.scanner.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        user: { select: { email: true, passwordHash: true, previousRole: true } },
        _count: { select: { logs: true } },
      },
    });

    return scanners.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.user.email,
      isActive: s.isActive,
      // `passwordHash` absent = invitation jamais acceptée. On expose le FAIT,
      // jamais le hash — l'organisateur doit pouvoir relancer sans deviner.
      hasAcceptedInvite: Boolean(s.user.passwordHash),
      /** Rôle d'avant la promotion, s'il s'agissait d'un compte existant. */
      promotedFrom: s.user.previousRole,
      scanCount: s._count.logs,
      createdAt: s.createdAt,
    }));
  }

  /** Crée un compte scanner et envoie l'invitation à l'adresse indiquée. */
  async invite(managerId: string, dto: { name: string; email: string }) {
    const event = await this.getMyEventOrThrow(managerId);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({
        code: ErrorCodes.EMAIL_ALREADY_EXISTS,
        message:
          'Un compte existe déjà avec cet email — utilisez « Promouvoir un compte existant ».',
      });
    }

    const inviteToken = randomBytes(32).toString('hex');
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Compte et rattachement dans la MÊME transaction : un utilisateur créé
    // sans son scanner ne pourrait plus être ni invité ni promu, l'email
    // étant déjà pris.
    const scanner = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          role: Role.SCANNER,
          isActive: true,
          inviteToken,
          inviteTokenExpiresAt,
        },
        select: { id: true, email: true, name: true },
      });
      return tx.scanner.create({
        data: { eventId: event.id, userId: user.id, name: dto.name },
        select: { id: true, name: true, user: { select: { email: true } } },
      });
    });

    let emailSent = true;
    try {
      await this.email.sendScannerInviteEmail({
        to: dto.email,
        name: dto.name,
        eventTitle: event.title,
        inviteUrl: `${FRONTEND_URL}/auth/set-password?token=${inviteToken}`,
      });
    } catch {
      // L'échec d'envoi ne doit pas annuler la création : le compte existe,
      // l'organisateur peut relancer l'invitation.
      emailSent = false;
    }

    await this.audit.log('manager.scanner.invited', 'Scanner', scanner.id, {
      eventId: event.id,
      email: dto.email,
      emailSent,
    });

    return { id: scanner.id, name: scanner.name, email: dto.email, emailSent };
  }

  /**
   * Promeut un compte existant en scanner de l'événement.
   *
   * Le rôle d'origine est conservé pour pouvoir le rendre : sans lui, retirer
   * un scanner laisserait un compte orphelin qu'aucun écran ne sait plus
   * traiter.
   */
  async promote(managerId: string, dto: { email: string }) {
    const event = await this.getMyEventOrThrow(managerId);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, name: true, role: true, scannerProfile: { select: { id: true } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.USER_NOT_FOUND,
        message: 'Aucun compte avec cet email — utilisez « Inviter par email ».',
      });
    }
    if (user.scannerProfile) {
      throw new BadRequestException({
        code: ErrorCodes.SCANNER_PROMOTION_INVALID,
        message: 'Ce compte est déjà scanner.',
      });
    }
    // Un Manager ou un Admin promu perdrait son propre espace : on refuse
    // plutôt que de le découvrir après coup.
    if (user.role !== Role.CLIENT) {
      throw new BadRequestException({
        code: ErrorCodes.SCANNER_PROMOTION_INVALID,
        message: 'Seul un compte client peut être promu scanner.',
      });
    }

    const scanner = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { role: Role.SCANNER, previousRole: user.role },
      });
      return tx.scanner.create({
        data: { eventId: event.id, userId: user.id, name: user.name ?? user.email },
        select: { id: true, name: true },
      });
    });

    await this.audit.log('manager.scanner.promoted', 'Scanner', scanner.id, {
      eventId: event.id,
      email: user.email,
      previousRole: user.role,
    });

    return { id: scanner.id, name: scanner.name, email: user.email };
  }

  async setActive(managerId: string, scannerId: string, isActive: boolean) {
    const event = await this.getMyEventOrThrow(managerId);
    const scanner = await this.prisma.scanner.findUnique({
      where: { id: scannerId },
      select: { id: true, eventId: true },
    });
    if (!scanner) {
      throw new NotFoundException({
        code: ErrorCodes.SCANNER_NOT_FOUND,
        message: 'Scanner introuvable.',
      });
    }
    if (scanner.eventId !== event.id) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Ce scanner n'appartient pas à votre événement.",
      });
    }

    await this.prisma.scanner.update({ where: { id: scannerId }, data: { isActive } });
    await this.audit.log('manager.scanner.active_changed', 'Scanner', scannerId, { isActive });
    return { id: scannerId, isActive };
  }

  /**
   * Retire un scanner. Le compte n'est pas supprimé : il retrouve son rôle
   * d'origine quand il en avait un, sinon il est simplement désactivé.
   * Supprimer l'utilisateur effacerait ses scans du journal par cascade.
   */
  async remove(managerId: string, scannerId: string) {
    const event = await this.getMyEventOrThrow(managerId);
    const scanner = await this.prisma.scanner.findUnique({
      where: { id: scannerId },
      select: {
        id: true,
        eventId: true,
        userId: true,
        user: { select: { previousRole: true, email: true } },
        _count: { select: { logs: true } },
      },
    });
    if (!scanner) {
      throw new NotFoundException({
        code: ErrorCodes.SCANNER_NOT_FOUND,
        message: 'Scanner introuvable.',
      });
    }
    if (scanner.eventId !== event.id) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Ce scanner n'appartient pas à votre événement.",
      });
    }
    if (scanner._count.logs > 0) {
      throw new BadRequestException({
        code: ErrorCodes.SCANNER_PROMOTION_INVALID,
        message:
          'Ce scanner a déjà validé des billets — désactivez-le plutôt, son journal doit rester traçable.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.scanner.delete({ where: { id: scannerId } });
      const restored = scanner.user.previousRole ?? null;
      await tx.user.update({
        where: { id: scanner.userId },
        data: restored
          ? { role: restored, previousRole: null }
          : // Aucun rôle d'origine : le compte n'existait que pour scanner, on
            // le désactive plutôt que de le laisser sans usage.
            { isActive: false },
      });
    });

    await this.audit.log('manager.scanner.removed', 'Scanner', scannerId, {
      email: scanner.user.email,
      roleRestored: scanner.user.previousRole ?? null,
    });

    return { id: scannerId };
  }
}
