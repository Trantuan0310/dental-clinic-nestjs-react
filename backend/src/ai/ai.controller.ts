import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AiService } from './ai.service';
import { SummaryQuerySchema } from './dto/summary-query.dto';
import type { AiPatientSummary } from './ai.types';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('summary/patient/:id')
  @RequirePermissions('ai.summary.read')
  @ApiOperation({
    summary: 'AI tóm tắt hồ sơ bệnh nhân (3 bullet: dị ứng, đang chờ, lần tới)',
  })
  async getPatientSummary(
    @Param('id') id: string,
    @Query() raw: Record<string, unknown>,
  ): Promise<{ data: AiPatientSummary }> {
    const { top, refresh } = SummaryQuerySchema.parse(raw);
    const data = await this.ai.getPatientSummary(id, top, refresh);
    return { data };
  }
}
