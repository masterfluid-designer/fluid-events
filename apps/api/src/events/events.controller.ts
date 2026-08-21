import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /** Réservé au rôle MANAGER — managerId dérivé du JWT, jamais du body (RULES.md §1). */
  @Roles(Role.MANAGER)
  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() data: CreateEventDto) {
    return this.eventsService.createEvent(user.id, data);
  }

  /**
   * Mise à jour d'un événement du manager authentifié.
   *
   * `?eventId=` désigne lequel (2026-08-21). Absent, la route vaut pour un
   * manager mono-événement — tous ceux d’avant le palier Premium, dont rien
   * ne change. L'appartenance est vérifiée dans le service, jamais ici.
   */
  @Roles(Role.MANAGER)
  @Patch('mine')
  async updateMyEvent(
    @CurrentUser() user: RequestUser,
    @Body() data: UpdateEventDto,
    @Query('eventId') eventId?: string,
  ) {
    return this.eventsService.updateMyEvent(user.id, data, eventId);
  }

  /** Page événement publique — CDC §6.2, doit être déclarée avant `:id`. */
  @Public()
  @Get('public/:slug')
  async getPublicEvent(@Param('slug') slug: string) {
    return this.eventsService.getPublicEventBySlug(slug);
  }

  /** Événement du manager authentifié — déclarée avant `:id` (même piège que `public/:slug`). */
  @Roles(Role.MANAGER)
  @Get('mine')
  async getMyEvent(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.eventsService.getMyEvent(user.id, eventId);
  }

  /** Statistiques réelles (revenus, ventes, scans) de l'événement du manager. */
  @Roles(Role.MANAGER)
  @Get('mine/overview')
  async getMyEventOverview(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.eventsService.getMyEventOverview(user.id, eventId);
  }

  /** Participants (billets payés) — ownership Manager vérifiée dans le service. */
  @Roles(Role.MANAGER)
  @Get(':eventId/participants')
  async getParticipants(@Param('eventId') eventId: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.getParticipants(eventId, user.id);
  }
}
