import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { StockService } from './stock.service';
import { WebhookIdempotencyService, ALREADY_PROCESSED } from './webhook-idempotency.service';
import { ClientProfileService } from './client-profile.service';
import { KkiapayService } from './kkiapay.service';
import { PdfQueueService } from '../pdf-queue/pdf-queue.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { KkiapayWebhookDto } from './dto/kkiapay-webhook.dto';
import { ErrorCodes, KkiapayInitResult, PaymentProviderType } from '@saas-events/types';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/** V1 : un seul provider réellement branché (CDC — se concentrer sur Kkiapay). */
const SUPPORTED_PROVIDERS: PaymentProviderType[] = [PaymentProviderType.KKIAPAY];

/** true hors production — même flag utilisé à l'init (widget) et à la vérification serveur. */
function isSandboxMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * PaymentsService — Initiation (CDC §8) et confirmation webhook Kkiapay.
 *
 * Kkiapay n'a pas de "checkoutUrl" serveur : l'init réserve le stock + crée
 * l'Order (PENDING), puis renvoie au client les paramètres du widget Kkiapay.
 * La confirmation réelle vient exclusivement du webhook, RE-vérifié côté
 * serveur via `k.verify()` (anti-fraude, doc Kkiapay) — jamais du seul
 * callback client (RULES.md : ne jamais faire confiance à une donnée non
 * revalidée côté serveur).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly webhookIdempotency: WebhookIdempotencyService,
    private readonly clientProfileService: ClientProfileService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly kkiapayService: KkiapayService,
    private readonly ticketDesignService: TicketDesignService,
    private readonly pdfQueueService: PdfQueueService,
  ) {}

  async initPayment(user: RequestUser, dto: InitPaymentDto): Promise<KkiapayInitResult> {
    if (!SUPPORTED_PROVIDERS.includes(dto.provider)) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.PROVIDER_NOT_ACTIVE,
        message: `Le provider ${dto.provider} n'est pas encore disponible.`,
      });
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: dto.ticketId },
      include: { event: { select: { id: true, status: true } } },
    });
    if (!ticket || !ticket.isActive) {
      throw new NotFoundException({
        code: ErrorCodes.TICKET_NOT_FOUND,
        message: 'Billet introuvable.',
      });
    }
    if (ticket.event.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "L'événement n'est pas actif.",
      });
    }
    const now = new Date();
    if (ticket.saleStartDate && now < ticket.saleStartDate) {
      throw new BadRequestException({
        code: ErrorCodes.TICKET_SALE_NOT_STARTED,
        message: 'La vente de ce billet n\'a pas encore commencé.',
      });
    }
    if (ticket.saleEndDate && now > ticket.saleEndDate) {
      throw new BadRequestException({
        code: ErrorCodes.TICKET_SALE_ENDED,
        message: 'La vente de ce billet est terminée.',
      });
    }
    if (!this.stockService.checkStockAvailable(ticket)) {
      throw new BadRequestException({
        code: ErrorCodes.TICKET_SOLD_OUT,
        message: 'Ce billet est épuisé.',
      });
    }

    const providerConfig = await this.prisma.paymentProviderConfig.findUnique({
      where: { provider: PaymentProviderType.KKIAPAY },
    });
    if (!providerConfig || !providerConfig.isActive || !providerConfig.publicKey) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.PROVIDER_NOT_ACTIVE,
        message: 'Le paiement Kkiapay n\'est pas configuré.',
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const decremented = await this.stockService.decrementStockAtomic(
        tx,
        ticket.id,
        ticket.stock,
        1,
      );
      if (!decremented) {
        throw new BadRequestException({
          code: ErrorCodes.STOCK_RACE_CONDITION,
          message: 'Ce billet vient d\'être épuisé.',
        });
      }

      const createdOrder = await tx.order.create({
        data: {
          eventId: ticket.eventId,
          clientId: user.id,
          status: 'PENDING',
          totalAmount: ticket.price,
          currency: ticket.currency,
          paymentProvider: PaymentProviderType.KKIAPAY,
        },
      });

      await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          ticketId: ticket.id,
          quantity: 1,
          unitPrice: ticket.price,
        },
      });

      return createdOrder;
    });

    await this.audit.log('payment.init', 'Order', order.id, {
      ticketId: ticket.id,
      clientId: user.id,
    });

    return {
      provider: PaymentProviderType.KKIAPAY,
      orderId: order.id,
      partnerId: order.id,
      amount: Number(ticket.price),
      currency: ticket.currency,
      publicKey: providerConfig.publicKey,
      sandbox: isSandboxMode(),
    };
  }

  /**
   * Statut d'une commande pour le client propriétaire — utilisé par le
   * frontend pour poller après fermeture du widget Kkiapay (RULES.md :
   * jamais de confirmation basée sur le seul callback client, cf. webhook).
   */
  async getOrderForClient(user: RequestUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        clientId: true,
        status: true,
        totalAmount: true,
        currency: true,
        paidAt: true,
        items: {
          select: {
            id: true,
            isScanned: true,
            qrCode: true,
            ticket: { select: { name: true } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Commande introuvable.' });
    }
    if (order.clientId !== user.id) {
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'Accès refusé.' });
    }

    return {
      id: order.id,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      paidAt: order.paidAt,
      items: order.items.map((item) => ({
        id: item.id,
        ticketName: item.ticket.name,
        hasTicket: Boolean(item.qrCode),
        isScanned: item.isScanned,
        qrCode: item.qrCode,
      })),
    };
  }

  /**
   * Liste des commandes du client authentifié (dashboard "Mes billets").
   * Scoping par `clientId` directement dans la requête — pas de check
   * d'ownership a posteriori nécessaire (RULES.md §1 : la sécurité vit dans
   * le service, ici via le WHERE lui-même).
   */
  async listOrdersForClient(user: RequestUser) {
    const orders = await this.prisma.order.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        paidAt: true,
        createdAt: true,
        event: { select: { title: true, startDate: true, location: true } },
        items: {
          select: {
            id: true,
            isScanned: true,
            qrCode: true,
            ticket: { select: { name: true } },
          },
        },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      event: order.event,
      items: order.items.map((item) => ({
        id: item.id,
        ticketName: item.ticket.name,
        hasTicket: Boolean(item.qrCode),
        isScanned: item.isScanned,
      })),
    }));
  }

  async handleKkiapayWebhook(payload: KkiapayWebhookDto, signatureHeader: string | undefined): Promise<void> {
    const providerConfig = await this.prisma.paymentProviderConfig.findUnique({
      where: { provider: PaymentProviderType.KKIAPAY },
    });
    if (!providerConfig || !providerConfig.webhookSecret) {
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        message: 'Webhook Kkiapay non configuré.',
      });
    }

    const expectedSecret = this.crypto.decrypt(providerConfig.webhookSecret);
    if (!signatureHeader || !this.crypto.safeEqual(signatureHeader, expectedSecret)) {
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        message: 'Signature webhook invalide.',
      });
    }

    const idempotency = await this.webhookIdempotency.recordOrSkip(
      PaymentProviderType.KKIAPAY,
      payload.transactionId,
    );
    if (idempotency === ALREADY_PROCESSED) {
      return;
    }

    if (!payload.partnerId) {
      this.logger.warn(`Webhook Kkiapay sans partnerId — transaction ${payload.transactionId} ignorée.`);
      await this.audit.log('payment.webhook.failed', 'Order', null, {
        transactionId: payload.transactionId,
        reason: 'missing_partner_id',
      });
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: payload.partnerId },
      include: {
        event: { select: { endDate: true } },
        items: { select: { id: true, ticketId: true, ticket: { select: { stock: true } } } },
      },
    });
    if (!order) {
      this.logger.warn(`Webhook Kkiapay — Order ${payload.partnerId} introuvable.`);
      await this.audit.log('payment.webhook.failed', 'Order', null, {
        transactionId: payload.transactionId,
        reason: 'order_not_found',
      });
      return;
    }
    if (order.status !== 'PENDING') {
      // Déjà traité par un webhook précédent (hors idempotence stricte transactionId) — no-op.
      return;
    }

    // Anti-fraude obligatoire (doc Kkiapay) : re-vérification serveur, jamais le seul webhook.
    let verification: Awaited<ReturnType<KkiapayService['verifyTransaction']>> | null = null;
    try {
      verification = await this.kkiapayService.verifyTransaction(
        {
          publicKey: providerConfig.publicKey!,
          privateKey: this.crypto.decrypt(providerConfig.privateKey),
          secretKey: providerConfig.webhookSecret ? this.crypto.decrypt(providerConfig.webhookSecret) : '',
          sandbox: isSandboxMode(),
        },
        payload.transactionId,
      );
    } catch (err) {
      this.logger.warn(`Échec vérification serveur Kkiapay (${payload.transactionId}) : ${(err as Error).message}`);
    }

    const amountMatches = verification ? Number(verification.amount) === Number(order.totalAmount) : false;
    const succeeded =
      payload.isPaymentSucces === true &&
      verification?.status === 'SUCCESS' &&
      amountMatches;

    if (succeeded) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paymentRef: payload.transactionId,
            paymentData: payload as any,
          },
        });

        for (const item of order.items) {
          const qrCode = this.ticketDesignService.generateQrToken(
            item.id,
            order.eventId,
            item.ticketId,
            order.event.endDate,
          );
          await tx.orderItem.update({ where: { id: item.id }, data: { qrCode } });
        }
      });

      await this.clientProfileService.enrichClientProfile(order.clientId, payload);
      // Génération PDF hors chemin critique webhook (CDC ADR §3) : on ne fait
      // qu'ajouter le job, le rendu Puppeteer se fait dans PdfProcessor.
      for (const item of order.items) {
        await this.pdfQueueService.enqueueGeneratePdf(item.id);
      }
      await this.audit.log('payment.webhook.success', 'Order', order.id, {
        transactionId: payload.transactionId,
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'FAILED', paymentData: payload as any },
        });
        for (const item of order.items) {
          await this.stockService.releaseStockAtomic(tx, item.ticketId, 1);
        }
      });

      await this.audit.log('payment.webhook.failed', 'Order', order.id, {
        transactionId: payload.transactionId,
        reason: amountMatches ? 'payment_failed' : 'verification_mismatch',
      });
    }
  }
}
