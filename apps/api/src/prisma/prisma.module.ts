import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Module Prisma — exporte PrismaService pour injection dans tous les services. */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
