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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { CatalogService } from './catalog.service';
import {
  AssignServiceDto,
  CreateCategoryDto,
  CreateServiceDto,
  EndAssignmentDto,
  ListServicesQueryDto,
  OnDateQueryDto,
  UpdateCategoryDto,
  UpdateServiceDto,
} from './dto/catalog.dto';

@ApiTags('Service catalogue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('service-categories')
  @RequirePermissions('service.read')
  async listCategories(@Query('includeInactive') includeInactive?: string) {
    return { data: await this.catalog.listCategories(includeInactive === 'true') };
  }

  @Post('service-categories')
  @RequirePermissions('service.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateCategoryDto, @User() actor: JwtPayload) {
    return { data: await this.catalog.createCategory(dto, actor) };
  }

  @Patch('service-categories/:id')
  @RequirePermissions('service.manage')
  async updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.catalog.updateCategory(id, dto, actor) };
  }

  @Get('services')
  @RequirePermissions('service.read')
  @ApiOperation({ summary: 'List services (active only unless includeInactive=true)' })
  async listServices(@Query() query: ListServicesQueryDto) {
    return { data: await this.catalog.listServices(query) };
  }

  @Post('services')
  @RequirePermissions('service.manage')
  @HttpCode(HttpStatus.CREATED)
  async createService(@Body() dto: CreateServiceDto, @User() actor: JwtPayload) {
    return { data: await this.catalog.createService(dto, actor) };
  }

  @Get('services/:id')
  @RequirePermissions('service.read')
  async getService(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.catalog.getService(id) };
  }

  @Patch('services/:id')
  @RequirePermissions('service.manage')
  async updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.catalog.updateService(id, dto, actor) };
  }

  @Post('services/:id/deactivate')
  @RequirePermissions('service.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate (BR-SVC-003): ends every running assignment today' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.catalog.setServiceActive(id, false, actor) };
  }

  @Post('services/:id/activate')
  @RequirePermissions('service.manage')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.catalog.setServiceActive(id, true, actor) };
  }

  @Get('services/:id/dentists')
  @RequirePermissions('service.read')
  @ApiOperation({ summary: 'Active dentists who perform the service on a date' })
  async serviceDentists(@Param('id', ParseUUIDPipe) id: string, @Query() query: OnDateQueryDto) {
    return { data: await this.catalog.listServiceDentists(id, query.date) };
  }

  @Get('dentists/:userId/services')
  @RequirePermissions('dentist.read', 'service.read')
  async dentistServices(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: OnDateQueryDto,
  ) {
    return { data: await this.catalog.listDentistServices(userId, query.date) };
  }

  @Post('dentists/:userId/services')
  @RequirePermissions('dentist.assign_service')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a service to a dentist (BR-SVC-004)' })
  async assign(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignServiceDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.catalog.assign(userId, dto, actor) };
  }

  @Post('dentists/:userId/services/:assignmentId/end')
  @RequirePermissions('dentist.assign_service')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End an assignment (BR-SVC-005)' })
  async end(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: EndAssignmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.catalog.endAssignment(userId, assignmentId, dto.effectiveTo, actor) };
  }
}
