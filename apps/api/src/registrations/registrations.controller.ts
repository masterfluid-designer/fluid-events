import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  async lister(
    @CurrentUser() user: RequestUser,
    @Query('eventId') eventId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    return this.registrations.listerPourManager(user.id, eventId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      q,
    });
  }

  /**
   * GET /api/scan/registrations — la liste d'émargement de l'agent
   * (2026-08-23).
   *
   * Sous `/scan` et non sous `/registrations` : c'est l'outil de terrain de
   * l'agent de contrôle, au même titre que `/scan/validate`. Aucun
   * paramètre d'événement — il vient du compte.
   */
  @Roles(Role.SCANNER)
  @Get('scan/registrations')
  async listerPourAgent(@CurrentUser() user: RequestUser) {
    return this.registrations.listerPourAgent(user.id);
  }

  /** PATCH /api/scan/registrations/:id/check-in — pointage par un agent. */
  @Roles(Role.SCANNER)
  @Patch('scan/registrations/:id/check-in')
  async pointerParAgent(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { present?: boolean },
  ) {
    return this.registrations.pointerParAgent(user.id, id, body.present !== false);
  }

  /**
   * PATCH /api/registrations/:id/check-in — pointage à l'entrée.
   * Réversible : on se trompe de ligne sur un téléphone, debout, dans le
   * bruit.
   */
  @Roles(Role.MANAGER)
  @Patch('registrations/:id/check-in')
  async pointer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { present?: boolean },
  ) {
    return this.registrations.pointer(user.id, id, body.present !== false);
  }

  /** DELETE /api/registrations/:id — désistement. */
  @Roles(Role.MANAGER)
  @Delete('registrations/:id')
  async retirer(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.registrations.retirer(user.id, id);
  }
}
