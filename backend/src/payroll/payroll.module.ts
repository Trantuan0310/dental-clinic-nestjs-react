import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PayrollController } from './payroll.controller';
import { ShiftRegistrationController } from './shift-registration.controller';
import { PayrollService } from './payroll.service';
import { ShiftRegistrationService } from './shift-registration.service';
import { PayrollCron } from './payroll.cron';
import { PayrollEventListener } from './payroll.listener';

@Module({
  imports: [PrismaModule, AuditModule, ScheduleModule.forRoot()],
  controllers: [PayrollController, ShiftRegistrationController],
  providers: [PayrollService, ShiftRegistrationService, PayrollCron, PayrollEventListener],
  exports: [PayrollService, ShiftRegistrationService],
})
export class PayrollModule {}
