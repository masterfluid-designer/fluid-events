import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(@Body() data: CreateEventDto) {
    return this.eventsService.createEvent(data);
  }

  /** Page événement publique — CDC §6.2, doit être déclarée avant `:id`. */
  @Public()
  @Get('public/:slug')
  async getPublicEvent(@Param('slug') slug: string) {
    return this.eventsService.getPublicEventBySlug(slug);
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
