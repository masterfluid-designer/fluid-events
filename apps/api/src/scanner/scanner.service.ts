import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { AuditService } from '../common/audit.service';
import { decideScan } from './scan-decision';
import { ScanResult, ScanValidationResult } from '@saas-events/types';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/** Mappe chaque résultat de scan vers l'action d'audit correspondante (CDC §15.5). */
const AUDIT_ACTION_BY_RESULT: Record<ScanResult, string> = {
  [ScanResult.VALID]: 'scan.valid',
  [ScanResult.ALREADY_USED]: 'scan.already_used',
  [ScanResult.EXPIRED]: 'scan.expired',
  [ScanResult.INVALID]: 'scan.invalid',
  [ScanResult.EVENT_MISMATCH]: 'scan.invalid',
};

/**
 * ScannerService — Orchestration de la validation d'un scan QR (CDC §9.5).
 *
 * Charge tout le contexte nécessaire (scanner, event, orderItem) puis délègue
 * la décision à la fonction pure `decideScan`. Le verrou anti-double-scan est
 * appliqué via un `updateMany` gardé (même idiome que `StockService`) : la
 * condition `isScanned: false` dans le WHERE garantit qu'un seul scan concurrent
 * peut gagner la course, sans avoir besoin d'un `$transaction` explicite
 * puisqu'un `updateMany` unique est déjà atomique au niveau ligne PostgreSQL.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketDesignService: TicketDesignService,
    private readonly audit: AuditService,
  ) {}

  async validateScan(
    user: RequestUser,
    qrToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<ScanValidationResult> {
    const qrVerification = this.ticketDesignService.verifyQrToken(qrToken);

    // Chargement parallèle — scanner et orderItem sont indépendants l'un de
    // l'autre (cible perf < 500ms, CDC §9.5).
    const [scanner, orderItem] = await Promise.all([
      this.prisma.scanner.findUnique({
        where: { userId: user.id },
        select: { id: true, isActive: true, eventId: true },
      }),
      qrVerification.valid && qrVerification.payload
        ? this.prisma.orderItem.findUnique({
            where: { id: qrVerification.payload.oid },
            select: {
              id: true,
              isScanned: true,
              order: {
                select: { status: true, client: { select: { name: true } } },
              },
              ticket: { select: { name: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    const event = scanner
      ? await this.prisma.event.findUnique({
          where: { id: scanner.eventId },
          select: { id: true, status: true },
        })
      : null;

    const decision = decideScan({ qrVerification, scanner, event, orderItem });

    if (decision.result === ScanResult.VALID && orderItem && scanner) {
      // Verrou atomique : ne marque scanné que si personne d'autre ne l'a fait entre-temps.
      const updateResult = await this.prisma.orderItem.updateMany({
        where: { id: orderItem.id, isScanned: false },
        data: { isScanned: true, scannedAt: new Date(), scannedById: scanner.id },
      });

      if (updateResult.count === 0) {
        // Course perdue contre un autre scan concurrent sur le même billet.
        await this.recordScan(scanner.id, orderItem.id, ScanResult.ALREADY_USED, user.id, ip, userAgent);
        return { result: ScanResult.ALREADY_USED };
      }

      await this.recordScan(scanner.id, orderItem.id, ScanResult.VALID, user.id, ip, userAgent);
      return {
        result: ScanResult.VALID,
        attendee: {
          name: decision.attendee!.name,
          ticketName: decision.attendee!.ticketName,
          scannedAt: new Date(),
        },
      };
    }

    if (scanner) {
      await this.recordScan(scanner.id, orderItem?.id ?? null, decision.result, user.id, ip, userAgent);
    } else {
      await this.audit.log(AUDIT_ACTION_BY_RESULT[decision.result], 'User', user.id, { qrToken: undefined });
    }

    return { result: decision.result };
  }

  /** Journalise un scan (ScannerLog + AuditLog). Non-bloquant : n'interrompt jamais la réponse. */
  private async recordScan(
    scannerId: string,
    orderItemId: string | null,
    result: ScanResult,
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.prisma.scannerLog.create({
        data: {
          scannerId,
          orderItemId,
          result,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Échec écriture ScannerLog : ${(err as Error).message}`);
    }

    await this.audit.log(AUDIT_ACTION_BY_RESULT[result], 'OrderItem', orderItemId, {
      scannerId,
      userId,
    });
  }
}
