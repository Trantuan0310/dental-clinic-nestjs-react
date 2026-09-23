import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { DoctorsService } from './doctors.service';
import { UpdateDoctorProfileDto } from './dto/doctor.dto';

@ApiTags('Doctors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Get()
  @RequirePermissions('doctor.read')
  @ApiOperation({ summary: 'List active dentist accounts and professional profiles' })
  async list(@User() actor: JwtPayload) {
    return { data: await this.doctors.list(actor.permissions.includes('doctor.manage')) };
  }

  @Put(':id/profile')
  @RequirePermissions('doctor.manage')
  @ApiOperation({ summary: 'Create or update a dentist profile and service assignments' })
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorProfileDto,
    @User() actor: JwtPayload,
  ) {
    return this.doctors.updateProfile(id, dto, actor);
  }
}
