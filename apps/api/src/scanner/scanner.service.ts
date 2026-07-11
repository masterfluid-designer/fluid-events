import { Injectable, Logger } from '@nestjs/common';
import { ScanResult } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { decideScan, ScanContext } from './scan-decision';

export interface ScanValidationResponse {
  result: ScanResult;
  attendee?: { name: string; ticketName: string; scannedAt: string };
}

interface ScanMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * ScannerService — orchestration du scan QR (CDC §9.5).
 *
 * La décision elle-même est déléguée à `decideScan()` (fonction pure, testée
 * isolément) ; ce service ne fait que charger le contexte depuis Prisma et
 * persister le résultat de façon atomique (RULES.md §2, §4).
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketDesign: TicketDesignService,
  ) {}

  async validateScan(
    scannerUserId: string,
    qrToken: string,
    meta: ScanMeta,
  ): Promise<ScanValidationResponse> {
    const qrVerification = this.ticketDesign.verifyQrToken(qrToken);

    const scanner = await this.prisma.scanner.findUnique({
      where: { userId: scannerUserId },
      select: { id: true, isActive: true, eventId: true },
    });

    let event: ScanContext['event'] = null;
    let orderItem: ScanContext['orderItem'] = null;

    if (qrVerification.valid) {
      const payload = qrVerification.payload!;
      [event, orderItem] = await Promise.all([
        this.prisma.event.findUnique({
          where: { id: payload.eid },
          select: { id: true, status: true },
        }),
        this.prisma.orderItem.findUnique({
          where: { id: payload.oid },
          select: {
            id: true,
            isScanned: true,
            order: {
              select: {
                status: true,
                // ⚠️ SEUL `name` est chargé — jamais email/phone (CDC §2.2, RULES §4)
                client: { select: { name: true } },
              },
            },
            ticket: { select: { name: true } },
          },
        }),
      ]);
    }

    const decision = decideScan({ qrVerification, scanner, event, orderItem });

    let scannedAt: Date | null = null;

    if (decision.shouldMarkScanned && orderItem && scanner) {
      // Verrou atomique anti double-scan : l'update ne réussit que si
      // isScanned est encore false au moment de l'écriture (RULES §2, §4).
      const now = new Date();
      const updateResult = await this.prisma.orderItem.updateMany({
        where: { id: orderItem.id, isScanned: false },
        data: { isScanned: true, scannedAt: now, scannedById: scanner.id },
      });

      if (updateResult.count === 0) {
        // Course perdue contre un autre scan concurrent entre le chargement
        // du contexte et l'écriture — le billet vient d'être scanné ailleurs.
        await this.logScan(scanner.id, orderItem.id, ScanResult.ALREADY_USED, meta);
        return { result: ScanResult.ALREADY_USED };
      }
      scannedAt = now;
    }

    await this.logScan(scanner?.id, orderItem?.id, decision.result, meta);

    if (decision.result === ScanResult.VALID && decision.attendee) {
      return {
        result: decision.result,
        attendee: {
          ...decision.attendee,
          scannedAt: (scannedAt ?? new Date()).toISOString(),
        },
      };
    }

    return { result: decision.result };
  }

  /** Journalise chaque tentative de scan, quel que soit le résultat (audit). */
  private async logScan(
    scannerId: string | undefined,
    orderItemId: string | undefined,
    result: ScanResult,
    meta: ScanMeta,
  ): Promise<void> {
    if (!scannerId) {
      // Scanner introuvable en base (JWT valide mais Scanner supprimé) — rien
      // à rattacher, on se contente d'un log applicatif.
      this.logger.warn(`Scan refusé — scanner introuvable pour ce user (result=${result})`);
      return;
    }
    await this.prisma.scannerLog.create({
      data: {
        scannerId,
        orderItemId,
        result,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  }
}
