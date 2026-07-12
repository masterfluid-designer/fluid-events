import { Controller, Get } from '@nestjs/common';
import { Role } from '@saas-events/types';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /api/admin/overview — CDC §14.2, réservé SUPER_ADMIN. */
  @Roles(Role.SUPER_ADMIN)
  @Get('overview')
  async getOverview() {
    return this.adminService.getOverview();
  }
}
