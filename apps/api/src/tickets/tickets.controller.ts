import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

/**
 * TicketsController — CRUD des types de billets (CDC §6.3).
 * JwtAuthGuard + RolesGuard sont globaux (AppModule) ; ownership vérifié
 * dans TicketsService (RULES.md §1).
 */
@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles(Role.MANAGER)
  @Post('events/:eventId/tickets')
  async create(
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.createTicket(eventId, user.id, dto);
  }

  @Roles(Role.MANAGER)
  @Get('events/:eventId/tickets')
  async listByEvent(@Param('eventId') eventId: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.listByEvent(eventId, user.id);
  }

  @Roles(Role.MANAGER)
  @Get('tickets/:id')
  async getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.getTicket(id, user.id);
  }

  @Roles(Role.MANAGER)
  @Patch('tickets/:id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.updateTicket(id, user.id, dto);
  }

  @Roles(Role.MANAGER)
  @Delete('tickets/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.ticketsService.deleteTicket(id, user.id);
    return { deleted: true };
  }
}
