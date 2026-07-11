import { IsNotEmpty, IsString } from 'class-validator';

/** DTO — POST /api/scan/validate. */
export class ValidateScanDto {
  @IsString()
  @IsNotEmpty()
  qrToken!: string;
}
