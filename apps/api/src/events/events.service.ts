import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(data: any) {
    return this.prisma.event.create({ data });
  }

  async getEvent(id: string) {
    return this.prisma.event.findUnique({ where: { id } });
  }

  async listEvents() {
    return this.prisma.event.findMany();
  }
}
