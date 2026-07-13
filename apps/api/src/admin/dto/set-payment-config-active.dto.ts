import { IsBoolean } from 'class-validator';

/** DTO — PATCH /api/admin/events/:eventId/payment-config/:provider */
export class SetPaymentConfigActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
