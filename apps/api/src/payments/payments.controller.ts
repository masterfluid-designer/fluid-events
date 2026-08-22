import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@saas-events/types';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { PaymentsService } from './payments.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { InitGuestPaymentDto } from './dto/init-guest-payment.dto';
import { GuestCheckoutService } from './guest-checkout.service';
import { TicketAccessService } from './ticket-access.service';
import { KkiapayWebhookDto } from './dto/kkiapay-webhook.dto';
import { CinetPayNotificationDto } from './dto/cinetpay-notification.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly guestCheckout: GuestCheckoutService,
    private readonly ticketAccess: TicketAccessService,
  ) {}

  /** POST /api/payments/init (CDC §8) — JwtAuthGuard + RolesGuard globaux (AppModule). */
  @Roles(Role.CLIENT)
  @Post('init')
  async init(@CurrentUser() user: RequestUser, @Body() dto: InitPaymentDto) {
    return this.paymentsService.initPayment(user, dto);
  }

  /**
   * POST /api/payments/init-guest — achat SANS COMPTE (lot 1, 2026-08-22).
   *
   * Public par nécessité : c'est tout l'objet du régime TICKETED_GUEST. La
   * porte reste étroite — `resoudreAcheteur` relit le régime en base et
   * refuse tout événement qui exige un compte. Le client ne choisit donc
   * pas de se passer de compte : c’est l’organisateur qui l’a décidé.
   *
   * Le reste du tunnel est celui de tout le monde : `initPayment` ne lit que
   * l'identifiant du porteur, et le webhook demeure seule source de vérité
   * pour confirmer un paiement.
   */
  @Public()
  @Post('init-guest')
  async initGuest(@Body() dto: InitGuestPaymentDto) {
    const acheteur = await this.guestCheckout.resoudreAcheteur({
      eventSlug: dto.eventSlug,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    return this.paymentsService.initPayment(acheteur, { items: dto.items });
  }

  /**
   * GET /api/payments/ticket/:token — le billet par son lien signé
   * (lot 1, 2026-08-22).
   *
   * Public parce qu'il n'y a personne à authentifier : un acheteur sans
   * compte n'a pas de tableau de bord, et ce lien EST son accès. Le jeton
   * ne désigne qu’une commande, et la réponse ne porte ni son email ni son
   * nom — un lien se transfère, se retrouve dans un fil de discussion,
   * s’ouvre sur un téléphone prêté.
   */
  @Public()
  @Get('ticket/:token')
  async getTicketByToken(@Param('token') token: string) {
    return this.ticketAccess.lireCommande(token);
  }

  /**
   * GET /api/payments/orders — commandes du client authentifié (dashboard
   * "Mes billets"). `?eventSlug=` (optionnel, décision produit 2026-07-13 —
   * bouton "Mon ticket" du header événement) restreint aux commandes de cet
   * événement uniquement, filtré côté serveur (jamais renvoyer au client des
   * commandes d'autres événements qu'il n'a pas demandées).
   */
  @Roles(Role.CLIENT)
  @Get('orders')
  async listOrders(@CurrentUser() user: RequestUser, @Query('eventSlug') eventSlug?: string) {
    return this.paymentsService.listOrdersForClient(user, eventSlug);
  }

  /**
   * GET /api/payments/orders/:id — statut d'une commande, pour le polling
   * frontend après fermeture du widget Kkiapay (le webhook reste la seule
   * source de vérité de confirmation, jamais le seul callback client).
   */
  @Roles(Role.CLIENT)
  @Get('orders/:id')
  async getOrder(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.paymentsService.getOrderForClient(user, id);
  }

  /**
   * POST /api/payments/webhook/kkiapay — authentifié par le header
   * `x-kkiapay-secret` (pas de JWT), toujours 2xx sauf signature invalide
   * (doc Kkiapay : accuser réception par un code 2xx pour éviter les retries).
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/kkiapay')
  async webhookKkiapay(
    @Body() dto: KkiapayWebhookDto,
    @Headers('x-kkiapay-secret') secret: string | undefined,
  ) {
    await this.paymentsService.handleKkiapayWebhook(dto, secret);
    return { received: true };
  }

  /**
   * POST /api/payments/webhook/cinetpay — authentifié par le header `x-token`
   * (HMAC-SHA256 sur les champs `cpm_*`, voir CinetPayService.computeCinetPayHmac).
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/cinetpay')
  async webhookCinetPay(
    @Body() dto: CinetPayNotificationDto,
    @Headers('x-token') xToken: string | undefined,
  ) {
    await this.paymentsService.handleCinetPayWebhook(dto, xToken);
    return { received: true };
  }

  /**
   * POST /api/payments/webhook/fedapay — authentifié par le header
   * `X-FEDAPAY-SIGNATURE`, vérifié via le SDK officiel (`Webhook.constructEvent`)
   * qui a besoin du corps BRUT (`req.rawBody`, activé dans main.ts), pas du
   * JSON re-sérialisé par le body-parser.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/fedapay')
  async webhookFedaPay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-fedapay-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    await this.paymentsService.handleFedaPayWebhook(rawBody, signature);
    return { received: true };
  }
}
