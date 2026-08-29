import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { DeactivateUserDto } from './dto/deactivate-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { JwtPayload } from '../common/guards/permissions.guard';

@ApiTags('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Post()
  @RequirePermissions('user.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    const result = await this.usersService.create(
      createUserDto,
      currentUser.sub,
      currentUser.email,
      ipAddress,
      userAgent,
    );

    return { data: result };
  }

  @Get(':id')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.usersService.getById(id) };
  }

  @Patch(':id')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    return {
      data: await this.usersService.update(
        id,
        updateUserDto,
        currentUser.sub,
        currentUser.email,
        ipAddress,
        userAgent,
      ),
    };
  }

  @Put(':id/roles')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Update user roles' })
  @ApiResponse({ status: 200, description: 'User roles updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Cannot remove last admin' })
  async updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRolesDto: UpdateUserRolesDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    return {
      data: await this.usersService.updateRoles(
        id,
        updateRolesDto,
        currentUser.sub,
        currentUser.email,
        ipAddress,
        userAgent,
      ),
    };
  }

  @Post(':id/deactivate')
  @RequirePermissions('user.deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 204, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Cannot deactivate last admin' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deactivateUserDto: DeactivateUserDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    await this.usersService.deactivate(
      id,
      deactivateUserDto.reason,
      currentUser.sub,
      currentUser.email,
      ipAddress,
      userAgent,
    );
  }

  @Post(':id/reactivate')
  @RequirePermissions('user.deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivate user' })
  @ApiResponse({ status: 204, description: 'User reactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    await this.usersService.reactivate(
      id,
      currentUser.sub,
      currentUser.email,
      ipAddress,
      userAgent,
    );
  }

  @Post(':id/reset-password')
  @RequirePermissions('user.reset_password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset user password' })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() resetPasswordDto: ResetUserPasswordDto,
    @User() currentUser: JwtPayload,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || null;
    const userAgent = req.get('user-agent') || null;

    return {
      data: await this.usersService.resetPassword(
        id,
        resetPasswordDto.sendEmail ?? true,
        currentUser.sub,
        currentUser.email,
        ipAddress,
        userAgent,
      ),
    };
  }

  @Get(':id/login-history')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'Get user login history' })
  @ApiResponse({ status: 200, description: 'Login history' })
  async getLoginHistory(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const limit = parseInt(req.query['limit'] as string) || 20;
    const cursor = req.query['cursor'] as string | undefined;

    const result = await this.usersService.getLoginHistory(id, limit, cursor);
    return { data: result.data, pagination: result.pagination };
  }
}
