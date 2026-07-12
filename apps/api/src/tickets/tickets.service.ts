import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ErrorCodes } from '@saas-events/types';

/** Code d'erreur Prisma — violation de contrainte de clé étrangère. */
const FOREIGN_KEY_VIOLATION = 'P2003';

/**
 * TicketsService — CRUD des types de billets (CDC §6.3).
 *
 * Règle d'or (RULES.md §1) : la sécurité vit dans NestJS, jamais dans Supabase RLS.
 * Chaque opération d'écriture vérifie explicitement l'ownership
 * (event.managerId === user.id) avant de toucher au ticket.
 */
@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOwnedEventOrThrow(eventId: string, managerId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, managerId: true },
    });
    if (!event) {
      throw new NotFoundException({
        code: ErrorCodes.EVENT_NOT_FOUND,
        message: 'Événement introuvable.',
      });
    }
    if (event.managerId !== managerId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Vous n'êtes pas le gestionnaire de cet événement.",
      });
    }
    return event;
  }

  private async getOwnedTicketOrThrow(ticketId: string, managerId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: { select: { id: true, managerId: true } } },
    });
    if (!ticket) {
      throw new NotFoundException({
        code: ErrorCodes.TICKET_NOT_FOUND,
        message: 'Billet introuvable.',
      });
    }
    if (ticket.event.managerId !== managerId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: "Vous n'êtes pas le gestionnaire de cet événement.",
      });
    }
    return ticket;
  }

  async createTicket(eventId: string, managerId: string, dto: CreateTicketDto) {
    await this.getOwnedEventOrThrow(eventId, managerId);

    return this.prisma.ticket.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency,
        stock: dto.stock,
        maxPerOrder: dto.maxPerOrder,
        category: dto.category,
        isActive: dto.isActive,
        saleStartDate: dto.saleStartDate ? new Date(dto.saleStartDate) : undefined,
        saleEndDate: dto.saleEndDate ? new Date(dto.saleEndDate) : undefined,
        designImageUrl: dto.designImageUrl,
        designBgColor: dto.designBgColor,
        designTextColor: dto.designTextColor,
      },
    });
  }

  async listByEvent(eventId: string, managerId: string) {
    await this.getOwnedEventOrThrow(eventId, managerId);
    return this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTicket(ticketId: string, managerId: string) {
    return this.getOwnedTicketOrThrow(ticketId, managerId);
  }

  async updateTicket(ticketId: string, managerId: string, dto: UpdateTicketDto) {
    await this.getOwnedTicketOrThrow(ticketId, managerId);

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...dto,
        saleStartDate: dto.saleStartDate ? new Date(dto.saleStartDate) : undefined,
        saleEndDate: dto.saleEndDate ? new Date(dto.saleEndDate) : undefined,
      },
    });
  }

  async deleteTicket(ticketId: string, managerId: string): Promise<void> {
    await this.getOwnedTicketOrThrow(ticketId, managerId);

    try {
      await this.prisma.ticket.delete({ where: { id: ticketId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === FOREIGN_KEY_VIOLATION
      ) {
        // Des commandes existent déjà pour ce ticket — suppression bloquée par la BDD.
        throw new ConflictException({
          code: 'TICKET_HAS_ORDERS',
          message: 'Impossible de supprimer un billet ayant déjà des commandes. Désactivez-le plutôt.',
        });
      }
      throw err;
    }
  }
}
