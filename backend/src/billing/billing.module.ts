import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ExpenseModule } from '../expense/expense.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { EncounterClosedListener } from './encounter-closed.listener';
import { BillingCron } from './billing.cron';

@Module({
  imports: [PrismaModule, AuditModule, ExpenseModule],
  controllers: [BillingController],
  providers: [BillingService, InvoicePdfService, EncounterClosedListener, BillingCron],
  exports: [BillingService],
})
export class BillingModule {}
