import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAssistService } from './ai-assist.service';
import { AiModel } from './ai-model';

@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [AiController],
  providers: [AiService, AiAssistService, AiModel],
})
export class AiModule {}
