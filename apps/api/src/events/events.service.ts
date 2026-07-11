import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(data: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
    });
  }

  async getEvent(id: string) {
    return this.prisma.event.findUnique({ where: { id } });
  }

  async listEvents() {
    return this.prisma.event.findMany();
  }

  /**
   * Page événement publique (CDC §6.2 GET /api/events/:slug/public) —
   * accessible sans authentification, uniquement si l'événement est publié.
   */
  async getPublicEventBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        tickets: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
        },
      },
    });

    if (!event || event.status !== 'PUBLISHED') {
      throw new NotFoundException('Event not found');
    }

    return event;
  }
}
