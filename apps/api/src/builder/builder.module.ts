import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAccessModule } from '../common/event-access.module';
import { BuilderService } from './builder.service';
import { BuilderController } from './builder.controller';

@Module({
  imports: [PrismaModule, EventAccessModule],
  providers: [BuilderService],
  controllers: [BuilderController],
})
export class BuilderModule {}
