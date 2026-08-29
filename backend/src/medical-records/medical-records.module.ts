import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { AppointmentCancelListener } from './appointment-cancel.listener';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService, AppointmentCancelListener],
  exports: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
