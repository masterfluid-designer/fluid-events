import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCodes, EventAccessMode } from '@saas-events/types';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { EventAccessService } from '../common/event-access.service';
import { PhoneService } from '../notifications/phone.service';
import { EmailService } from '../notifications/email.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';

/** Code Prisma — violation de contrainte d'unicité. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * RegistrationsService — inscriptions sans billetterie (lot 2, 2026-08-22).
 *
 * Ni compte, ni commande, ni paiement : l'organisateur veut savoir qui vient.
 * Le formulaire est PUBLIC, ce qui en fait la seule porte ouverte de la
 * plateforme sur une écriture en base — d'où l'unicité par adresse, seul
 * garde-fou qui ne coûte rien à un inscrit de bonne foi.
 *
 * Pas de CAPTCHA : sur l'inscription à une soirée, il arrête moins de robots
 * qu'il ne décourage d'invités.
 */
@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly acces: EventAccessService,
    private readonly phoneService: PhoneService,
    private readonly email: EmailService,
  ) {}

  /**
   * Enregistre un participant. Le régime est relu EN BASE : sans cela, on
   * pourrait remplir la liste d'un événement qui vend des billets.
   */
  async inscrire(eventSlug: string, dto: CreateRegistrationDto) {
    const event = await this.prisma.event.findUnique({
      where: { slug: eventSlug },
      select: {
        id: true,
        accessMode: true,
        status: true,
        title: true,
        startDate: true,
        venueName: true,
        city: true,
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }

    if (event.accessMode !== EventAccessMode.RSVP) {
      throw new ForbiddenException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "Cet événement ne fonctionne pas sur inscription.",
      });
    }

    if (event.status !== 'PUBLISHED') {
      throw new BadRequestException({
        code: ErrorCodes.EVENT_NOT_ACTIVE,
        message: "L'événement n'est pas ouvert aux inscriptions.",
      });
    }

    const email = dto.email.trim().toLowerCase();

    try {
      const inscription = await this.prisma.registration.create({
        data: {
          eventId: event.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          // Un numéro illisible ne fait pas échouer l'inscription : il sert à
          // joindre, pas à identifier.
          phone: dto.phone ? this.phoneService.normalizeToE164(dto.phone) : null,
          extraLabel: dto.extraLabel?.trim() || null,
          extraValue: dto.extraValue?.trim() || null,
        },
        select: { id: true, firstName: true, createdAt: true },
      });

      await this.audit.log('registration.created', 'Registration', inscription.id, {
        eventId: event.id,
      });

      /*
       * La confirmation part sans bloquer : `sendRegistrationConfirmationEmail`
       * n'échoue jamais vers l'appelant. Une inscription enregistrée ne doit
       * pas paraître refusée parce qu'un serveur d'email a hoqueté — le nom
       * est sur la liste de toute façon.
       */
      await this.email.sendRegistrationConfirmationEmail({
        to: email,
        firstName: inscription.firstName,
        eventTitle: event.title,
        dateLabel: new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(event.startDate),
        placeLabel: [event.venueName, event.city].filter(Boolean).join(', ') || undefined,
      });

      return { id: inscription.id, firstName: inscription.firstName, eventTitle: event.title };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        /*
         * Déjà inscrit. On le DIT, plutôt que de faire semblant d'accepter :
         * contrairement à un formulaire de connexion, il n'y a rien à
         * protéger ici — la liste n'est pas secrète pour qui y figure, et
         * laisser croire à une seconde inscription ferait douter la personne
         * de sa présence sur la liste le soir venu.
         */
        throw new ConflictException({
          code: ErrorCodes.ALREADY_REGISTERED,
          message: 'Cette adresse est déjà inscrite à cet événement.',
        });
      }
      throw err;
    }
  }

  /**
   * Liste des inscrits, pour le tableau de bord de l'organisateur.
   * L'appartenance passe par le contrôle partagé — un manager ne lit jamais
   * la liste d'un événement qui n'est pas le sien.
   */
  async listerPourManager(managerId: string, eventId?: string) {
    const id = await this.acces.resoudreEvenementDuManager(managerId, eventId);

    const inscriptions = await this.prisma.registration.findMany({
      where: { eventId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        extraLabel: true,
        extraValue: true,
        createdAt: true,
      },
    });

    return { total: inscriptions.length, items: inscriptions };
  }
}
