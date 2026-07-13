import { Body, Controller, Get, Param, Put } from '@nestjs/common';
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
  @Get('mine')
  async getMine(@CurrentUser() user: RequestUser) {
    return this.builderService.getMyBlocks(user.id);
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
