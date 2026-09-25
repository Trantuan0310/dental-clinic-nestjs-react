import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { EmployeesService, RequestMeta } from './employees.service';
import { DentistsService } from './dentists.service';
import {
  ChangePracticeStatusDto,
  CreateDentistProfileDto,
  CreateEmployeeDto,
  LinkAccountDto,
  ListDentistsQueryDto,
  ListEmployeesQueryDto,
  TerminateEmployeeDto,
  UpdateDentistProfileDto,
  UpdateEmployeeDto,
} from './dto/staff.dto';

const requestMeta = (req: Request): RequestMeta => ({
  ipAddress: req.ip || null,
  userAgent: req.get('user-agent') || null,
});

@ApiTags('Staff — employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'List employees' })
  async list(@Query() query: ListEmployeesQueryDto) {
    return this.employees.list(query);
  }

  @Post()
  @RequirePermissions('employee.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an employee record' })
  async create(@Body() dto: CreateEmployeeDto, @User() actor: JwtPayload, @Req() req: Request) {
    return { data: await this.employees.create(dto, actor, requestMeta(req)) };
  }

  @Get(':id')
  @RequirePermissions('employee.read')
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.employees.getById(id) };
  }

  @Patch(':id')
  @RequirePermissions('employee.update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.employees.update(id, dto, actor, requestMeta(req)) };
  }

  @Post(':id/terminate')
  @RequirePermissions('employee.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminate employment (BR-STAFF-004/005)' })
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateEmployeeDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.employees.terminate(id, dto, actor, requestMeta(req)) };
  }

  @Post(':id/account')
  @RequirePermissions('employee.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an existing account or create one' })
  async linkAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkAccountDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.employees.linkAccount(id, dto, actor, requestMeta(req)) };
  }

  @Post(':id/dentist-profile')
  @RequirePermissions('dentist.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Make the employee a dentist (BR-STAFF-002)' })
  async createDentistProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDentistProfileDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.employees.createDentistProfile(id, dto, actor, requestMeta(req)) };
  }
}

@ApiTags('Staff — dentists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dentists')
export class DentistsController {
  constructor(private readonly dentists: DentistsService) {}

  @Get()
  @RequirePermissions('dentist.read')
  @ApiOperation({ summary: 'List dentist profiles' })
  async list(@Query() query: ListDentistsQueryDto) {
    return { data: await this.dentists.list(query) };
  }

  @Get(':userId')
  @RequirePermissions('dentist.read')
  async getOne(@Param('userId', ParseUUIDPipe) userId: string) {
    return { data: await this.dentists.getByUserId(userId) };
  }

  @Get(':userId/overview')
  @RequirePermissions('dentist.read')
  @ApiOperation({ summary: 'Profile, weekly schedule and upcoming appointments' })
  async overview(@Param('userId', ParseUUIDPipe) userId: string) {
    return { data: await this.dentists.overview(userId) };
  }

  @Patch(':userId')
  @RequirePermissions('dentist.update', 'dentist.update.own')
  async update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateDentistProfileDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.dentists.update(userId, dto, actor, requestMeta(req)) };
  }

  @Post(':userId/deactivate')
  @RequirePermissions('dentist.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend or retire a dentist (BR-STAFF-004)' })
  async deactivate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangePracticeStatusDto,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.dentists.deactivate(userId, dto, actor, requestMeta(req)) };
  }

  @Post(':userId/activate')
  @RequirePermissions('dentist.deactivate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @User() actor: JwtPayload,
    @Req() req: Request,
  ) {
    return { data: await this.dentists.activate(userId, actor, requestMeta(req)) };
  }
}
