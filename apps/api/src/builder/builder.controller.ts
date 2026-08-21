import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BuilderService } from './builder.service';

/**
 * BuilderController — Event Builder no-code (CDC §11).
 * JwtAuthGuard + RolesGuard sont globaux (AppModule) ; ownership vérifiée
 * dans BuilderService (RULES.md §1).
 */
@Controller('builder')
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Roles(Role.MANAGER)
  /** `?eventId=` désigne l'événement visé (2026-08-21) ; absent, celui du
   *  manager mono-événement. */
  @Get('mine')
  async getMine(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.builderService.getMyBlocks(user.id, eventId);
  }

  @Roles(Role.MANAGER)
  @Put(':eventId/blocks')
  async saveBlocks(
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
  ) {
    return this.builderService.saveBlocks(eventId, user.id, body);
  }
}
