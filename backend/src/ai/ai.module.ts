import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAssistService } from './ai-assist.service';
import { AiModel } from './ai-model';
import { AiChatService } from './assistant/ai-chat.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { BillingModule } from '../billing/billing.module';
import { TreatmentPlansModule } from '../treatment-plans/treatment-plans.module';

@Module({
  imports: [
    PrismaModule,
    ReportsModule,
    AppointmentsModule,
    PatientsModule,
    BillingModule,
    TreatmentPlansModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiAssistService, AiChatService, AiModel],
})
export class AiModule {}
