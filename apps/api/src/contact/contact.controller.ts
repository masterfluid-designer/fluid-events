import { Body, Controller, Post, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCodes } from '@saas-events/types';
import { Public } from '../common/decorators/public.decorator';
import { EmailService } from '../notifications/email.service';
import { SendContactMessageDto } from './dto/send-contact-message.dto';

/** POST /api/contact — formulaire public (/contact, /support). */
@Controller('contact')
export class ContactController {
  constructor(private readonly emailService: EmailService) {}

  @Public()
  @Post()
  async sendMessage(@Body() dto: SendContactMessageDto) {
    try {
      await this.emailService.sendContactMessage(dto);
    } catch {
      throw new ServiceUnavailableException({
        code: ErrorCodes.CONTACT_SEND_FAILED,
        message:
          "Impossible d'envoyer votre message pour le moment — réessayez plus tard ou écrivez-nous directement.",
      });
    }
    return { sent: true };
  }
}
