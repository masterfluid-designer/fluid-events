import { IsBoolean } from 'class-validator';

/** DTO — PATCH /api/admin/managers/:id/active */
export class SetManagerActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
