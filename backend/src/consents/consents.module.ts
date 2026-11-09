import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminConsentsController,
  PatientConsentsController,
  PublicConsentNoticesController,
} from './consents.controller';
import { ConsentsService } from './consents.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PatientConsentsController, AdminConsentsController, PublicConsentNoticesController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
