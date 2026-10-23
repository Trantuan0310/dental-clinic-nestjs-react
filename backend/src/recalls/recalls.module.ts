import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PublicRecallsController, RecallsController } from './recalls.controller';
import { RecallsService } from './recalls.service';
import { RecallsCron } from './recalls.cron';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RecallsController, PublicRecallsController],
  providers: [RecallsService, RecallsCron],
})
export class RecallsModule {}
