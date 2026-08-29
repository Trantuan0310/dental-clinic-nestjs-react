import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { InventoryService } from './inventory.service';
import { wrapAsPaginated } from '../common/dto/pagination.dto';
import {
  CreateInventoryCategoryDto,
  CreateInventoryItemDto,
  ListInventoryQueryDto,
  ListMovementsQueryDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // ==========================================================================
  // Items
  // ==========================================================================

  @Get('items')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List inventory items (BR-INV-005 low-stock filter)' })
  async list(@Query() q: ListInventoryQueryDto) {
    return wrapAsPaginated(await this.inventory.listItems(q));
  }

  @Get('items/low-stock')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'Low-stock report' })
  async lowStock() {
    return wrapAsPaginated(await this.inventory.lowStockReport());
  }

  @Get('items/:id')
  @RequirePermissions('inventory.read')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.inventory.getItem(id) };
  }

  @Post('items')
  @RequirePermissions('inventory.create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateInventoryItemDto, @User() actor: JwtPayload) {
    return { data: await this.inventory.createItem(dto, actor) };
  }

  @Put('items/:id')
  @RequirePermissions('inventory.update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.inventory.updateItem(id, dto, actor) };
  }

  @Delete('items/:id')
  @RequirePermissions('inventory.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    await this.inventory.deleteItem(id, actor);
  }

  // ==========================================================================
  // Stock movements
  // ==========================================================================

  @Post('items/:id/stock-in')
  @RequirePermissions('inventory.stock_in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stock-in (BR-INV-002): receipt from supplier' })
  async stockIn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockInDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.inventory.stockIn(id, dto, actor) };
  }

  @Post('items/:id/stock-out')
  @RequirePermissions('inventory.stock_out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stock-out (BR-INV-003): manual deduction (waste/loss)' })
  async stockOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockOutDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.inventory.stockOut(id, dto, actor) };
  }

  @Post('items/:id/adjust')
  @RequirePermissions('inventory.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stock adjustment (BR-INV-004): set absolute quantity with reason' })
  async adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockAdjustmentDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.inventory.adjustStock(id, dto, actor) };
  }

  @Get('movements')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'Stock movement history' })
  async listMovements(@Query() q: ListMovementsQueryDto) {
    return wrapAsPaginated(await this.inventory.listMovements(q));
  }

  // ==========================================================================
  // Categories
  // ==========================================================================

  @Get('categories')
  @RequirePermissions('inventory.read')
  async listCategories() {
    return wrapAsPaginated(await this.inventory.listCategories());
  }

  @Post('categories')
  @RequirePermissions('inventory.create')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateInventoryCategoryDto, @User() actor: JwtPayload) {
    return { data: await this.inventory.createCategory(dto, actor) };
  }
}
