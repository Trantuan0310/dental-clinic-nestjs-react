import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { OnEvent } from '@nestjs/event-emitter';
import { RolesService } from './roles.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import { cachedHandler } from '../common/cache.util';
import { RedisCacheService } from '../common/redis-cache.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtPayload } from '../common/guards/permissions.guard';

@ApiTags('admin/roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly cache: RedisCacheService,
  ) {}

  // Invalidate role + permission cache whenever role data changes.
  @OnEvent('role.changed')
  async onRoleChanged() {
    await this.cache.delByPattern('roles:*');
    await this.cache.delByPattern('permissions:*');
  }

  @Get()
  @RequirePermissions('role.upsert')
  @ApiOperation({ summary: 'List all roles' })
  @ApiResponse({ status: 200, description: 'List of roles' })
  async list() {
    const roles = await cachedHandler(this.cache, 'roles:list', 300, async () =>
      this.rolesService.list(),
    );
    return wrapAsPaginated(roles);
  }

  @Get('permissions')
  @RequirePermissions('role.upsert')
  @ApiOperation({ summary: 'List all permissions' })
  @ApiResponse({ status: 200, description: 'List of permissions' })
  async getPermissions() {
    const perms = await cachedHandler(this.cache, 'permissions:list', 300, async () =>
      this.rolesService.getPermissions(),
    );
    return wrapAsPaginated(perms);
  }

  @Get(':id')
  @RequirePermissions('role.upsert')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiResponse({ status: 200, description: 'Role details' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.rolesService.getById(id) };
  }

  @Post()
  @RequirePermissions('role.upsert')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  async create(
    @Body() createRoleDto: CreateRoleDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    const role = await this.rolesService.create(
      createRoleDto,
      currentUser.sub,
      currentUser.email,
      ipAddress,
      userAgent,
    );
    await this.cache.delByPattern('roles:*');
    return { data: role };
  }

  @Patch(':id')
  @RequirePermissions('role.upsert')
  @ApiOperation({ summary: 'Update role' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRoleDto: UpdateRoleDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    const role = await this.rolesService.update(
      id,
      updateRoleDto,
      currentUser.sub,
      currentUser.email,
      ipAddress,
      userAgent,
    );
    await this.cache.delByPattern('roles:*');
    return { data: role };
  }

  @Delete(':id')
  @RequirePermissions('role.upsert')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete role' })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete system role or role with users' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    await this.rolesService.delete(id, currentUser.sub, currentUser.email, ipAddress, userAgent);
    await this.cache.delByPattern('roles:*');
  }
}
