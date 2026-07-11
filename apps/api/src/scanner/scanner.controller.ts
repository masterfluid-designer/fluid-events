import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { ScannerService } from './scanner.service';
import { ValidateScanDto } from './dto/validate-scan.dto';

/**
 * ScannerController — CDC §9.5, §10.
 *
 * JwtAuthGuard + RolesGuard sont globaux (AppModule) ; @Roles(SCANNER) suffit
 * ici pour restreindre l'accès.
 */
@Controller('scan')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Roles(Role.SCANNER)
  @Post('validate')
  async validate(
    @CurrentUser() user: RequestUser,
    @Body() dto: ValidateScanDto,
    @Req() req: Request,
  ) {
    return this.scannerService.validateScan(user.id, dto.qrToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
