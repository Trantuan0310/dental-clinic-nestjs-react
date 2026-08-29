import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsCron } from './appointments.cron';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsCron],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
