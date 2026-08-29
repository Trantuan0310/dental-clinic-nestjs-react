import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ExpenseModule } from '../expense/expense.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { EncounterClosedListener } from './encounter-closed.listener';

@Module({
  imports: [PrismaModule, AuditModule, ExpenseModule],
  controllers: [BillingController],
  providers: [BillingService, EncounterClosedListener],
  exports: [BillingService],
})
export class BillingModule {}
