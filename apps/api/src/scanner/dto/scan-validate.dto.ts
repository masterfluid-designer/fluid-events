import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO — Body de POST /api/scan/validate (CDC §9.5).
 */
export class ScanValidateDto {
  @IsString()
  @IsNotEmpty()
  qrToken!: string;
}
