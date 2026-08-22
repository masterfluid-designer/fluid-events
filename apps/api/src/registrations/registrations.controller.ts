import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

@Controller()
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  /**
   * POST /api/events/:slug/registrations — inscription publique (lot 2).
   *
   * Public parce que c'est tout l'objet du régime : personne à authentifier,
   * rien à payer. Le service relit le régime en base et refuse tout événement
   * qui n'est pas sur inscription.
   */
  @Public()
  @Post('events/:slug/registrations')
  async inscrire(@Param('slug') slug: string, @Body() dto: CreateRegistrationDto) {
    return this.registrations.inscrire(slug, dto);
  }

  /**
   * GET /api/registrations — la liste, pour l'organisateur.
   *
   * `eventId` optionnel : un manager mono-événement n'a pas à le préciser,
   * comme partout ailleurs dans le tableau de bord.
   */
  @Roles(Role.MANAGER)
  @Get('registrations')
  async lister(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.registrations.listerPourManager(user.id, eventId);
  }
}
