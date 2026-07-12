import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ScannerService } from './scanner.service';
import { ScanValidateDto } from './dto/scan-validate.dto';

@Controller('scan')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  /** POST /api/scan/validate (CDC §9.5) — JwtAuthGuard + RolesGuard sont globaux (AppModule). */
  @Roles(Role.SCANNER)
  @Post('validate')
  async validate(
    @CurrentUser() user: RequestUser,
    @Body() dto: ScanValidateDto,
    @Req() req: Request,
  ) {
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    return this.scannerService.validateScan(user, dto.qrToken, req.ip, userAgent);
  }
}
