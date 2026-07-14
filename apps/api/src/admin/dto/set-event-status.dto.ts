import { IsEnum } from 'class-validator';
import { EventStatus } from '@saas-events/types';

/** DTO — PATCH /api/admin/events/:eventId/status (Admin, tout événement). */
export class SetEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;
}
