import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentProviderType, Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { setImpersonatedAccessCookie, setImpersonatorCookie } from '../common/cookies.util';
import { AdminService } from './admin.service';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { SetPaymentConfigActiveDto } from './dto/set-payment-config-active.dto';
import { InviteManagerDto } from './dto/invite-manager.dto';
import { SetManagerActiveDto } from './dto/set-manager-active.dto';
import { SetManagerSubscriptionDto } from './dto/set-manager-subscription.dto';
import { SetEventStatusDto } from './dto/set-event-status.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /api/admin/overview — CDC §14.2, réservé SUPER_ADMIN. */
  @Roles(Role.SUPER_ADMIN)
  @Get('overview')
  async getOverview() {
    return this.adminService.getOverview();
  }

  /** GET /api/admin/events — vue plateforme de tous les événements. */
  @Roles(Role.SUPER_ADMIN)
  @Get('events')
  async listAllEvents() {
    return this.adminService.listAllEvents();
  }

  /** PATCH /api/admin/events/:eventId/status — annule/republie n'importe quel événement. */
  @Roles(Role.SUPER_ADMIN)
  @Patch('events/:eventId/status')
  async setEventStatus(@Param('eventId') eventId: string, @Body() dto: SetEventStatusDto) {
    return this.adminService.setEventStatus(eventId, dto.status);
  }

  /** GET /api/admin/logs?page=&pageSize=&action= — historique complet des logs d'audit. */
  @Roles(Role.SUPER_ADMIN)
  @Get('logs')
  async listAuditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.listAuditLogs({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      action: action || undefined,
    });
  }

  /** GET /api/admin/payment-configs — vue plateforme, tous événements (jamais les secrets). */
  @Roles(Role.SUPER_ADMIN)
  @Get('payment-configs')
  async listAllPaymentConfigs() {
    return this.adminService.listAllPaymentConfigs();
  }

  /** GET /api/admin/events/:eventId/payment-config — liste les configs (jamais les secrets). */
  @Roles(Role.SUPER_ADMIN)
  @Get('events/:eventId/payment-config')
  async getEventPaymentConfigs(@Param('eventId') eventId: string) {
    return this.adminService.getEventPaymentConfigs(eventId);
  }

  /** PUT /api/admin/events/:eventId/payment-config — crée/remplace les identifiants d'un provider. */
  @Roles(Role.SUPER_ADMIN)
  @Put('events/:eventId/payment-config')
  async upsertEventPaymentConfig(@Param('eventId') eventId: string, @Body() dto: UpsertPaymentConfigDto) {
    return this.adminService.upsertEventPaymentConfig(eventId, dto);
  }

  /** PATCH /api/admin/events/:eventId/payment-config/:provider — active/désactive sans toucher aux identifiants. */
  @Roles(Role.SUPER_ADMIN)
  @Patch('events/:eventId/payment-config/:provider')
  async setEventPaymentConfigActive(
    @Param('eventId') eventId: string,
    @Param('provider', new ParseEnumPipe(PaymentProviderType)) provider: PaymentProviderType,
    @Body() dto: SetPaymentConfigActiveDto,
  ) {
    return this.adminService.setEventPaymentConfigActive(eventId, provider, dto.isActive);
  }

  /** DELETE /api/admin/events/:eventId/payment-config/:provider */
  @Roles(Role.SUPER_ADMIN)
  @Delete('events/:eventId/payment-config/:provider')
  async deleteEventPaymentConfig(
    @Param('eventId') eventId: string,
    @Param('provider', new ParseEnumPipe(PaymentProviderType)) provider: PaymentProviderType,
  ) {
    await this.adminService.deleteEventPaymentConfig(eventId, provider);
    return { deleted: true };
  }

  /** GET /api/admin/managers — liste des managers (décision produit 2026-07-14). */
  @Roles(Role.SUPER_ADMIN)
  @Get('managers')
  async listManagers() {
    return this.adminService.listManagers();
  }

  /** POST /api/admin/managers — invitation par email. */
  @Roles(Role.SUPER_ADMIN)
  @Post('managers')
  async inviteManager(@Body() dto: InviteManagerDto) {
    return this.adminService.inviteManager(dto);
  }

  /** PATCH /api/admin/managers/:id/active — suspend/réactive un compte. */
  @Roles(Role.SUPER_ADMIN)
  @Patch('managers/:id/active')
  async setManagerActive(@Param('id') id: string, @Body() dto: SetManagerActiveDto) {
    return this.adminService.setManagerActive(id, dto.isActive);
  }

  /** PATCH /api/admin/managers/:id/subscription — statut manuel (V1, pas de facturation réelle). */
  @Roles(Role.SUPER_ADMIN)
  @Patch('managers/:id/subscription')
  async setManagerSubscription(@Param('id') id: string, @Body() dto: SetManagerSubscriptionDto) {
    return this.adminService.setManagerSubscription(id, dto.subscriptionActive);
  }

  /**
   * POST /api/admin/managers/:id/impersonate — connexion directe au dashboard
   * Manager sans ses identifiants (CDC §14.3). Conserve le token Admin
   * d'origine dans `impersonator_token` pour un retour sans réauthentification.
   */
  @Roles(Role.SUPER_ADMIN)
  @Post('managers/:id/impersonate')
  async impersonateManager(
    @Param('id') id: string,
    @Req() req: Request & { user: RequestUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const adminAccessToken = req.cookies?.access_token;
    const tokens = await this.adminService.impersonateManager(req.user.id, id);

    if (adminAccessToken) {
      setImpersonatorCookie(res, adminAccessToken);
    }
    setImpersonatedAccessCookie(res, tokens.accessToken);

    return { accessToken: tokens.accessToken };
  }
}
