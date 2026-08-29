import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { ShiftRegistrationController } from './shift-registration.controller';
import { PayrollService } from './payroll.service';
import { ShiftRegistrationService } from './shift-registration.service';
import { PayrollCron } from './payroll.cron';
import { PayrollEventListener } from './payroll.listener';

/**
 * Test-only PayrollModule: provider mocks (no real Prisma / Audit).
 * Used by *.spec.ts files that need the controllers' DI graph.
 */
class MockPrismaService {}
class MockAuditService {}

@Module({
  controllers: [PayrollController, ShiftRegistrationController],
  providers: [
    PayrollService,
    ShiftRegistrationService,
    PayrollCron,
    PayrollEventListener,
    { provide: 'PrismaService', useClass: MockPrismaService },
    { provide: 'AuditService', useClass: MockAuditService },
  ],
})
export class PayrollTestModule {}
