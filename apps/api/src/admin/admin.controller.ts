import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Put } from '@nestjs/common';
import { PaymentProviderType, Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';
import { SetPaymentConfigActiveDto } from './dto/set-payment-config-active.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /api/admin/overview — CDC §14.2, réservé SUPER_ADMIN. */
  @Roles(Role.SUPER_ADMIN)
  @Get('overview')
  async getOverview() {
    return this.adminService.getOverview();
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
}
