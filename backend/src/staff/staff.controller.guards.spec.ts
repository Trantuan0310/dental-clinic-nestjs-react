import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { DentistsController, EmployeesController } from './staff.controller';

/** A class placed between the decorators and a controller silently takes its guards. */
describe('staff controllers', () => {
  it.each([EmployeesController, DentistsController])('%p requires login and permissions', ctl => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ctl)).toEqual([JwtAuthGuard, PermissionsGuard]);
  });
});
