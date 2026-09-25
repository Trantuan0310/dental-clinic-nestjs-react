import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DentistsController, EmployeesController } from './staff.controller';
import { EmployeesService } from './employees.service';
import { DentistsService } from './dentists.service';

/** HR records and dentist profiles (ADR-0009 phase 1). */
@Module({
  imports: [UsersModule],
  controllers: [EmployeesController, DentistsController],
  providers: [EmployeesService, DentistsService],
  exports: [DentistsService],
})
export class StaffModule {}
