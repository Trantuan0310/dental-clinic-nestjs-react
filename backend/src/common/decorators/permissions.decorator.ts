import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from '../guards/permissions.guard';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
