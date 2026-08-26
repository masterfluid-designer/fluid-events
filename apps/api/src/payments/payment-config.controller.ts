import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { PaymentProviderType, Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { PaymentConfigService } from './payment-config.service';
import { ManagerPaymentConfigDto } from './dto/manager-payment-config.dto';

/**
 * Configuration de l'encaissement par l'organisateur (2026-08-24).
 *
 * Sous `/payments/config` et non sous `/admin` : c'est désormais l'affaire du
 * Manager. `eventId` reste OPTIONNEL — un organisateur mono-événement n'a pas
 * à le préciser, comme partout ailleurs dans le tableau de bord, et le service
 * refuse de deviner quand il y en a plusieurs.
 */
@Controller('payments/config')
export class PaymentConfigController {
  constructor(private readonly service: PaymentConfigService) {}

  /** Les fournisseurs configurés — jamais leurs identifiants. */
  @Roles(Role.MANAGER)
  @Get()
  async lister(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.service.lister(user.id, eventId);
  }

  /** Enregistre ou remplace les identifiants d'un fournisseur. */
  @Roles(Role.MANAGER)
  @Put()
  async enregistrer(
    @CurrentUser() user: RequestUser,
    @Body() dto: ManagerPaymentConfigDto,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.enregistrer(user.id, dto, eventId);
  }

  /** Active ou désactive un fournisseur déjà configuré. */
  @Roles(Role.MANAGER)
  @Patch(':provider/active')
  async basculer(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: PaymentProviderType,
    @Body() body: { isActive?: boolean },
    @Query('eventId') eventId?: string,
  ) {
    return this.service.basculer(user.id, provider, body.isActive !== false, eventId);
  }

  /** Retire un fournisseur et ses identifiants de cet événement. */
  @Roles(Role.MANAGER)
  @Delete(':provider')
  async supprimer(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: PaymentProviderType,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.supprimer(user.id, provider, eventId);
  }
}
