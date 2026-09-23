import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { CreateClinicServiceDto, UpdateClinicServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('Clinic services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermissions('service.read')
  @ApiOperation({ summary: 'List clinic services' })
  async list(@User() actor: JwtPayload) {
    return { data: await this.services.list(actor.permissions.includes('service.manage')) };
  }

  @Post()
  @RequirePermissions('service.manage')
  @ApiOperation({ summary: 'Create a clinic service' })
  create(@Body() dto: CreateClinicServiceDto, @User() actor: JwtPayload) {
    return this.services.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('service.manage')
  @ApiOperation({ summary: 'Update service details or activate/deactivate it' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicServiceDto,
    @User() actor: JwtPayload,
  ) {
    return this.services.update(id, dto, actor);
  }
}
