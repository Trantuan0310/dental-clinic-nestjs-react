import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientsProxyController } from './patients-proxy.controller';

import { IntakeController, PublicIntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [IntakeController, PublicIntakeController, PatientsController, PatientsProxyController],
  providers: [IntakeService, PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
