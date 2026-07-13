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
import { API_URL, FRONTEND_URL } from '../common/constants';
import { TicketDesignService } from '../ticket-design/ticket-design.service';
import { StockService } from './stock.service';
import { WebhookIdempotencyService, ALREADY_PROCESSED } from './webhook-idempotency.service';
import { ClientProfileService } from './client-profile.service';
import { KkiapayService } from './kkiapay.service';
import { CinetPayService, computeCinetPayHmac } from './cinetpay.service';
import { FedaPayService } from './fedapay.service';
import { PdfQueueService } from '../pdf-queue/pdf-queue.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { KkiapayWebhookDto } from './dto/kkiapay-webhook.dto';
import { CinetPayNotificationDto } from './dto/cinetpay-notification.dto';
import { ErrorCodes, PaymentInitResult, PaymentProviderType } from '@saas-events/types';
import { SUPPORTED_PAYMENT_PROVIDERS } from '../common/supported-payment-providers';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/** true hors production — même flag utilisé à l'init (widget) et à la vérification serveur. */
function isSandboxMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Sous-ensemble d'Order chargé pour finaliser un paiement (webhook), commun aux 3 providers. */
type OrderForFinalize = {
  id: string;
  eventId: string;
  clientId: string;
  totalAmount: unknown;
  event: { endDate: Date };
  items: { id: string; ticketId: string }[];
};

/**
 * PaymentsService — Initiation (CDC §8) et confirmation webhook, pour les 3
 * providers du CDC (Kkiapay, CinetPay, FedaPay).
 *
 * Kkiapay : pas de "checkoutUrl" serveur, le paiement s'initie côté client
 * via son widget JS. CinetPay/FedaPay : l'init renvoie une `checkoutUrl`
 * hébergée par le provider, le frontend redirige simplement le navigateur.
 *
 * Dans tous les cas, la confirmation réelle vient EXCLUSIVEMENT du webhook,
 * re-vérifié côté serveur (anti-fraude) — jamais du seul callback/redirect
 * client (RULES.md : ne jamais faire confiance à une donnée non revalidée).
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
    private readonly cinetPayService: CinetPayService,
    private readonly fedaPayService: FedaPayService,
    private readonly ticketDesignService: TicketDesignService,
    private readonly pdfQueueService: PdfQueueService,
  ) {}

  async initPayment(user: RequestUser, dto: InitPaymentDto): Promise<PaymentInitResult> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: dto.ticketId },
      include: { event: { select: { id: true, status: true, slug: true } } },
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

    // Au plus un provider `isActive` par événement (AdminService) — le client
    // ne choisit jamais le fournisseur, il est déterminé ici (RULES.md §1).
    const providerConfig = await this.prisma.paymentProviderConfig.findFirst({
      where: { eventId: ticket.event.id, isActive: true },
    });
    if (!providerConfig || !SUPPORTED_PAYMENT_PROVIDERS.includes(providerConfig.provider)) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.PROVIDER_NOT_ACTIVE,
        message: "Le paiement n'est pas configuré pour cet événement — contactez l'administrateur.",
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
          paymentProvider: providerConfig.provider,
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
      provider: providerConfig.provider,
    });

    if (providerConfig.provider === PaymentProviderType.KKIAPAY) {
      if (!providerConfig.publicKey) {
        throw new ServiceUnavailableException({
          code: ErrorCodes.PROVIDER_NOT_ACTIVE,
          message: "Le paiement n'est pas configuré pour cet événement — contactez l'administrateur.",
        });
      }
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

    if (providerConfig.provider === PaymentProviderType.CINETPAY) {
      const config = (providerConfig.config as { siteId?: string } | null) ?? {};
      try {
        const { paymentUrl } = await this.cinetPayService.initPayment(
          {
            apiKey: this.crypto.decrypt(providerConfig.privateKey),
            siteId: config.siteId ?? '',
            secretKey: providerConfig.webhookSecret ? this.crypto.decrypt(providerConfig.webhookSecret) : '',
          },
          {
            transactionId: order.id,
            amount: Number(ticket.price),
            currency: ticket.currency,
            description: `Billet ${ticket.name}`,
            notifyUrl: `${API_URL}/api/payments/webhook/cinetpay`,
            // Retombe sur la même page publique que le flux Kkiapay (widget) —
            // ResumeCheckout y détecte `orderId` et reprend directement le
            // polling GET /api/payments/orders/:id (le webhook reste la seule
            // source de vérité, cette page ne fait qu'afficher l'attente).
            returnUrl: `${FRONTEND_URL}/e/${ticket.event.slug}?resume=1&orderId=${order.id}`,
          },
        );
        return { provider: PaymentProviderType.CINETPAY, orderId: order.id, checkoutUrl: paymentUrl };
      } catch (err) {
        return this.abortFailedInit(order.id, ticket.id, PaymentProviderType.CINETPAY, err as Error);
      }
    }

    // FEDAPAY
    const config = (providerConfig.config as { environment?: 'sandbox' | 'live' } | null) ?? {};
    try {
      const { transactionId, checkoutUrl } = await this.fedaPayService.initPayment(
        {
          secretKey: this.crypto.decrypt(providerConfig.privateKey),
          environment: config.environment ?? 'sandbox',
        },
        {
          description: `Billet ${ticket.name}`,
          amount: Number(ticket.price),
          currency: ticket.currency,
          callbackUrl: `${FRONTEND_URL}/e/${ticket.event.slug}?resume=1&orderId=${order.id}`,
        },
      );
      // FedaPay assigne son propre id de transaction — on le stocke immédiatement
      // pour pouvoir corréler la commande au moment du webhook (contrairement à
      // Kkiapay/CinetPay où c'est nous qui choisissons l'identifiant transmis).
      await this.prisma.order.update({ where: { id: order.id }, data: { paymentRef: transactionId } });
      return { provider: PaymentProviderType.FEDAPAY, orderId: order.id, checkoutUrl };
    } catch (err) {
      return this.abortFailedInit(order.id, ticket.id, PaymentProviderType.FEDAPAY, err as Error);
    }
  }

  /**
   * Si l'appel externe d'initiation (CinetPay/FedaPay) échoue, l'Order/stock
   * créés juste avant (hors transaction externe, RULES.md §2) doivent être
   * annulés — sinon le stock resterait réservé indéfiniment pour une
   * commande qu'aucun webhook ne viendra jamais confirmer.
   */
  private async abortFailedInit(
    orderId: string,
    ticketId: string,
    provider: PaymentProviderType,
    err: Error,
  ): Promise<never> {
    this.logger.warn(`Échec init ${provider} (order ${orderId}) : ${err.message}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
      await this.stockService.releaseStockAtomic(tx, ticketId, 1);
    });
    await this.audit.log('payment.init.failed', 'Order', orderId, { provider, reason: err.message });
    throw new ServiceUnavailableException({
      code: ErrorCodes.PAYMENT_INIT_FAILED,
      message: "Impossible d'initier le paiement — réessayez dans un instant ou contactez l'administrateur.",
    });
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

  /** Marque la commande PAID, génère les QR et met en queue la génération PDF — commun aux 3 providers. */
  private async finalizeOrderPaid(order: OrderForFinalize, transactionId: string, rawPayload: unknown): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentRef: transactionId,
          paymentData: rawPayload as any,
        },
      });

      for (const item of order.items) {
        const qrCode = this.ticketDesignService.generateQrToken(item.id, order.eventId, item.ticketId, order.event.endDate);
        await tx.orderItem.update({ where: { id: item.id }, data: { qrCode } });
      }
    });

    await this.clientProfileService.enrichClientProfile(order.clientId, rawPayload);
    // Génération PDF hors chemin critique webhook (CDC ADR §3) : on ne fait
    // qu'ajouter le job, le rendu Puppeteer se fait dans PdfProcessor.
    for (const item of order.items) {
      await this.pdfQueueService.enqueueGeneratePdf(item.id);
    }
  }

  /** Marque la commande FAILED et relâche le stock — commun aux 3 providers. */
  private async finalizeOrderFailed(order: OrderForFinalize, rawPayload: unknown): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FAILED', paymentData: rawPayload as any },
      });
      for (const item of order.items) {
        await this.stockService.releaseStockAtomic(tx, item.ticketId, 1);
      }
    });
  }

  async handleKkiapayWebhook(payload: KkiapayWebhookDto, signatureHeader: string | undefined): Promise<void> {
    // La config webhook est PAR ÉVÉNEMENT (décision produit 2026-07-13) : il
    // faut d'abord résoudre l'Order → eventId avant de savoir quel secret
    // vérifier — Kkiapay ne transmet pas l'événement directement, seulement
    // `partnerId` (notre Order.id).
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
        event: { select: { id: true, endDate: true } },
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

    const providerConfig = await this.prisma.paymentProviderConfig.findUnique({
      where: { eventId_provider: { eventId: order.event.id, provider: PaymentProviderType.KKIAPAY } },
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
      await this.finalizeOrderPaid(order, payload.transactionId, payload);
      await this.audit.log('payment.webhook.success', 'Order', order.id, {
        transactionId: payload.transactionId,
      });
    } else {
      await this.finalizeOrderFailed(order, payload);
      await this.audit.log('payment.webhook.failed', 'Order', order.id, {
        transactionId: payload.transactionId,
        reason: amountMatches ? 'payment_failed' : 'verification_mismatch',
      });
    }
  }

  /**
   * Webhook CinetPay ("Prepare a notification page", doc réunie ROADMAP.md §6).
   * `cpm_trans_id` = notre `Order.id` (transaction_id qu'on a nous-mêmes fourni
   * à l'init) — pas de résolution indirecte nécessaire, contrairement à FedaPay.
   */
  async handleCinetPayWebhook(payload: CinetPayNotificationDto, xTokenHeader: string | undefined): Promise<void> {
    if (!payload.cpm_trans_id) {
      this.logger.warn('Webhook CinetPay sans cpm_trans_id — ignoré.');
      await this.audit.log('payment.webhook.failed', 'Order', null, { reason: 'missing_transaction_id', provider: 'CINETPAY' });
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: payload.cpm_trans_id },
      include: {
        event: { select: { id: true, endDate: true } },
        items: { select: { id: true, ticketId: true } },
      },
    });
    if (!order) {
      this.logger.warn(`Webhook CinetPay — Order ${payload.cpm_trans_id} introuvable.`);
      await this.audit.log('payment.webhook.failed', 'Order', null, {
        transactionId: payload.cpm_trans_id,
        reason: 'order_not_found',
        provider: 'CINETPAY',
      });
      return;
    }

    const providerConfig = await this.prisma.paymentProviderConfig.findUnique({
      where: { eventId_provider: { eventId: order.event.id, provider: PaymentProviderType.CINETPAY } },
    });
    if (!providerConfig || !providerConfig.webhookSecret) {
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        message: 'Webhook CinetPay non configuré.',
      });
    }

    const hmacSecret = this.crypto.decrypt(providerConfig.webhookSecret);
    const expectedHmac = computeCinetPayHmac(payload, hmacSecret);
    if (!xTokenHeader || !this.crypto.safeEqual(xTokenHeader, expectedHmac)) {
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        message: 'Signature (x-token) invalide.',
      });
    }

    const idempotency = await this.webhookIdempotency.recordOrSkip(PaymentProviderType.CINETPAY, payload.cpm_trans_id);
    if (idempotency === ALREADY_PROCESSED) {
      return;
    }
    if (order.status !== 'PENDING') {
      return;
    }

    // Anti-fraude obligatoire (même principe que Kkiapay, RULES.md §2) :
    // jamais se fier au seul x-token, re-vérifier via /v2/payment/check.
    const config = (providerConfig.config as { siteId?: string } | null) ?? {};
    let verification: Awaited<ReturnType<CinetPayService['checkTransaction']>> | null = null;
    try {
      verification = await this.cinetPayService.checkTransaction(
        {
          apiKey: this.crypto.decrypt(providerConfig.privateKey),
          siteId: config.siteId ?? '',
          secretKey: hmacSecret,
        },
        payload.cpm_trans_id,
      );
    } catch (err) {
      this.logger.warn(`Échec vérification serveur CinetPay (${payload.cpm_trans_id}) : ${(err as Error).message}`);
    }

    const amountMatches = verification ? Number(verification.amount) === Number(order.totalAmount) : false;
    const succeeded = verification?.status === 'ACCEPTED' && amountMatches;

    if (succeeded) {
      await this.finalizeOrderPaid(order, payload.cpm_trans_id, payload);
      await this.audit.log('payment.webhook.success', 'Order', order.id, { transactionId: payload.cpm_trans_id, provider: 'CINETPAY' });
    } else {
      await this.finalizeOrderFailed(order, payload);
      await this.audit.log('payment.webhook.failed', 'Order', order.id, {
        transactionId: payload.cpm_trans_id,
        reason: amountMatches ? 'payment_failed' : 'verification_mismatch',
        provider: 'CINETPAY',
      });
    }
  }

  /**
   * Webhook FedaPay. Contrairement à CinetPay/Kkiapay, l'identifiant de
   * transaction est assigné PAR FedaPay (pas par nous) — on le stocke sur
   * `Order.paymentRef` dès l'init (voir `initPayment`) pour pouvoir corréler
   * ici. Nécessite le corps BRUT (avant parsing JSON) : `Webhook.constructEvent`
   * du SDK signe la chaîne brute, pas l'objet re-sérialisé.
   */
  async handleFedaPayWebhook(rawBody: string, signatureHeader: string | undefined): Promise<void> {
    if (!signatureHeader) {
      throw new UnauthorizedException({ code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID, message: 'Signature webhook manquante.' });
    }

    let unsafeParsed: { name?: string; object?: { id?: number | string } };
    try {
      unsafeParsed = JSON.parse(rawBody);
    } catch {
      this.logger.warn('Webhook FedaPay — corps JSON invalide.');
      return;
    }

    // ⚠️ `transactionId` n'est PAS encore vérifié à ce stade — sert uniquement
    // à résoudre quel événement (donc quel secret) vérifier ensuite, même
    // logique que la résolution Order → eventId de Kkiapay/CinetPay.
    const transactionId = unsafeParsed.object?.id != null ? String(unsafeParsed.object.id) : undefined;
    if (!transactionId) {
      this.logger.warn('Webhook FedaPay sans object.id — ignoré.');
      await this.audit.log('payment.webhook.failed', 'Order', null, { reason: 'missing_transaction_id', provider: 'FEDAPAY' });
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { paymentProvider: PaymentProviderType.FEDAPAY, paymentRef: transactionId },
      include: {
        event: { select: { id: true, endDate: true } },
        items: { select: { id: true, ticketId: true } },
      },
    });
    if (!order) {
      this.logger.warn(`Webhook FedaPay — Order introuvable pour transaction ${transactionId}.`);
      await this.audit.log('payment.webhook.failed', 'Order', null, {
        transactionId,
        reason: 'order_not_found',
        provider: 'FEDAPAY',
      });
      return;
    }

    const providerConfig = await this.prisma.paymentProviderConfig.findUnique({
      where: { eventId_provider: { eventId: order.event.id, provider: PaymentProviderType.FEDAPAY } },
    });
    if (!providerConfig || !providerConfig.webhookSecret) {
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID,
        message: 'Webhook FedaPay non configuré.',
      });
    }

    const webhookSecret = this.crypto.decrypt(providerConfig.webhookSecret);
    let event: { name: string; object: unknown };
    try {
      event = this.fedaPayService.constructWebhookEvent(rawBody, signatureHeader, webhookSecret);
    } catch (err) {
      this.logger.warn(`Signature FedaPay invalide (${transactionId}) : ${(err as Error).message}`);
      throw new UnauthorizedException({ code: ErrorCodes.WEBHOOK_SIGNATURE_INVALID, message: 'Signature webhook invalide.' });
    }

    const idempotency = await this.webhookIdempotency.recordOrSkip(PaymentProviderType.FEDAPAY, transactionId);
    if (idempotency === ALREADY_PROCESSED) {
      return;
    }
    if (order.status !== 'PENDING') {
      return;
    }

    // Anti-fraude obligatoire (même principe que Kkiapay/CinetPay, RULES.md §2).
    const config = (providerConfig.config as { environment?: 'sandbox' | 'live' } | null) ?? {};
    let verification: Awaited<ReturnType<FedaPayService['getTransactionStatus']>> | null = null;
    try {
      verification = await this.fedaPayService.getTransactionStatus(
        { secretKey: this.crypto.decrypt(providerConfig.privateKey), environment: config.environment ?? 'sandbox' },
        transactionId,
      );
    } catch (err) {
      this.logger.warn(`Échec vérification serveur FedaPay (${transactionId}) : ${(err as Error).message}`);
    }

    const amountMatches = verification ? Number(verification.amount) === Number(order.totalAmount) : false;
    const succeeded = event.name === 'transaction.approved' && verification?.status === 'approved' && amountMatches;

    if (succeeded) {
      await this.finalizeOrderPaid(order, transactionId, event);
      await this.audit.log('payment.webhook.success', 'Order', order.id, { transactionId, provider: 'FEDAPAY' });
    } else {
      await this.finalizeOrderFailed(order, event);
      await this.audit.log('payment.webhook.failed', 'Order', order.id, {
        transactionId,
        reason: amountMatches ? 'payment_failed' : 'verification_mismatch',
        provider: 'FEDAPAY',
      });
    }
  }
}
