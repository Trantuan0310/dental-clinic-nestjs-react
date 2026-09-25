import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { AppointmentsCron } from './appointments.cron';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  // PayrollModule: the legacy /appointments/shift-registrations/:id/cancel
  // route delegates to ShiftRegistrationService.cancel (single implementation).
  imports: [ScheduleModule.forRoot(), PrismaModule, AuditModule, PayrollModule],
  controllers: [AppointmentsController, DispatchController],
  providers: [AppointmentsService, AvailabilityService, DispatchService, AppointmentsCron],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
