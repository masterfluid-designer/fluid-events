import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TicketRecoveryService } from './ticket-recovery.service';
import { RecoverTicketsDto } from './dto/recover-tickets.dto';

/**
 * POST /api/tickets/recover — "J'ai perdu mes billets" (page publique
 * /billets-perdus). Réponse toujours identique (succès), que la commande
 * existe ou que l'email corresponde ou non — pas d'énumération de commandes.
 */
@Controller('tickets')
export class TicketRecoveryController {
  constructor(private readonly ticketRecoveryService: TicketRecoveryService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('recover')
  async recover(@Body() dto: RecoverTicketsDto) {
    await this.ticketRecoveryService.recoverTickets(dto);
    return { success: true };
  }
}
