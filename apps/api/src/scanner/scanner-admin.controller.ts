import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ScannerAdminService } from './scanner-admin.service';

class InviteScannerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;
}

class PromoteScannerDto {
  @IsEmail()
  email!: string;
}

class SetScannerActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

/**
 * Comptes scanner d'un événement, gérés par son Manager (2026-08-19).
 *
 * Aucun endpoint ne créait de scanner jusqu'ici : ils ne naissaient que du
 * script de seed, ce qui rendait la billetterie invérifiable à l'entrée pour
 * tout événement réel.
 *
 * L'ownership n'est jamais un paramètre : chaque méthode part du manager
 * authentifié et remonte à SON événement (RULES.md §1). Un identifiant de
 * scanner appartenant à un autre événement est refusé, pas ignoré.
 */
@Controller('scanners')
export class ScannerAdminController {
  constructor(private readonly service: ScannerAdminService) {}

  /**
   * `?eventId=` désigne l'événement dont on gère les agents (2026-08-21).
   * Absent, celui du manager mono-événement. Un agent appartient à UN
   * événement : celui qui contrôle une soirée n'a aucune raison d'accéder aux
   * sept autres d’un manager Premium.
   */
  @Roles(Role.MANAGER)
  @Get()
  async list(@CurrentUser() user: RequestUser, @Query('eventId') eventId?: string) {
    return this.service.list(user.id, eventId);
  }

  /** Crée le compte et envoie l'invitation à l'adresse indiquée. */
  @Roles(Role.MANAGER)
  @Post('invite')
  async invite(
    @CurrentUser() user: RequestUser,
    @Body() dto: InviteScannerDto,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.invite(user.id, dto, eventId);
  }

  /** Promeut un compte client existant — il perd l'accès à ses billets. */
  @Roles(Role.MANAGER)
  @Post('promote')
  async promote(
    @CurrentUser() user: RequestUser,
    @Body() dto: PromoteScannerDto,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.promote(user.id, dto, eventId);
  }

  @Roles(Role.MANAGER)
  @Patch(':id/active')
  async setActive(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetScannerActiveDto,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.setActive(user.id, id, dto.isActive, eventId);
  }

  @Roles(Role.MANAGER)
  @Delete(':id')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.service.remove(user.id, id, eventId);
  }
}
