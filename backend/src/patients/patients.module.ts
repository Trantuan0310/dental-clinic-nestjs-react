import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientsProxyController } from './patients-proxy.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PatientsController, PatientsProxyController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
