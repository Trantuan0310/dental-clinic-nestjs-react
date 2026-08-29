import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

export const Permissions = (...permissions: string[]) => {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, descriptor.value);
    } else {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, target);
    }
    return descriptor ?? target;
  };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;

    if (!user || !user.permissions) {
      throw new ForbiddenException('Access denied: No permissions found');
    }

    const hasPermission = requiredPermissions.some(permission =>
      user.permissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied: Missing one of required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
