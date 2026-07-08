import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(@Body() data: any) {
    return this.eventsService.createEvent(data);
  }

  @Get(':id')
  async getEvent(@Param('id') id: string) {
    return this.eventsService.getEvent(id);
  }

  @Get()
  async listEvents() {
    return this.eventsService.listEvents();
  }
}
