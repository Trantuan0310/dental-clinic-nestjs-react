import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, JwtPayload } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { ShiftRegistrationService } from './shift-registration.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  CreateShiftRegistrationDto,
  RejectShiftDto,
  ListShiftRegistrationsQueryDto,
} from './dto/shift-registration.dto';

@ApiTags('ShiftRegistrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('shifts/registrations')
export class ShiftRegistrationController {
  constructor(private readonly shifts: ShiftRegistrationService) {}

  @Get()
  @RequirePermissions('shift.read.any', 'shift.read.own')
  @ApiOperation({ summary: 'List shift registrations' })
  async list(@Query() query: ListShiftRegistrationsQueryDto, @User() user: JwtPayload) {
    const isAdmin = user.permissions.includes('shift.read.any');
    return wrapAsPaginated(
      await this.shifts.list({
        dentistId: query.dentistId,
        status: query.status as any,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        requestorId: user.sub,
        isAdmin,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions('shift.read.any', 'shift.read.own')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const isAdmin = user.permissions.includes('shift.read.any');
    const data = await this.shifts.getById(id, user.sub, isAdmin);
    return { data };
  }

  @Post()
  @RequirePermissions('shift.register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new shift (BS or admin on behalf)' })
  async create(@Body() dto: CreateShiftRegistrationDto, @User() user: JwtPayload) {
    const isAdmin = user.permissions.includes('shift.approve');
    const data = await this.shifts.create(dto, user.sub, isAdmin);
    return { data };
  }

  @Post(':id/approve')
  @RequirePermissions('shift.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve shift (admin/receptionist)' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const data = await this.shifts.approve(id, user.sub);
    return { data };
  }

  @Post(':id/reject')
  @RequirePermissions('shift.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject shift (admin/receptionist)' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectShiftDto,
    @User() user: JwtPayload,
  ) {
    const data = await this.shifts.reject(id, dto, user.sub);
    return { data };
  }

  @Post(':id/cancel')
  @RequirePermissions('shift.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel own shift (BS ≥24h or admin)' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @User() user: JwtPayload) {
    const isAdmin =
      user.permissions.includes('shift.cancel') && user.permissions.includes('shift.approve');
    const data = await this.shifts.cancel(id, user.sub, isAdmin);
    return { data };
  }

  @Post('no-show-detection')
  @RequirePermissions('shift.read.any')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'BR-PAY-015: Detect BS no-show shifts in a date range. Returns shifts with 0 completed encounters.',
  })
  async detectNoShow(@Body() body: { from: string; to: string }) {
    const data = await this.shifts.detectNoShowShifts(new Date(body.from), new Date(body.to));
    return { data };
  }
}
