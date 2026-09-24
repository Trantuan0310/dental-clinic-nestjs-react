import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsCron } from './appointments.cron';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  // PayrollModule: the legacy /appointments/shift-registrations/:id/cancel
  // route delegates to ShiftRegistrationService.cancel (single implementation).
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule, PayrollModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsCron],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
