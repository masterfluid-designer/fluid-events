import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoService } from '../common/crypto.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  providers: [AdminService, CryptoService],
  controllers: [AdminController],
})
export class AdminModule {}
