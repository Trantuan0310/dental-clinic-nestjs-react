import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AiService } from './ai.service';
import { AiAssistService } from './ai-assist.service';
import { MessageDraftDto, NoteDraftDto, ReportCommentaryQueryDto } from './dto/assist.dto';
import { SummaryQuerySchema } from './dto/summary-query.dto';
import type { AiPatientSummary } from './ai.types';
import { User } from '../common/decorators/user.decorator';
import { JwtPayload } from '../common/guards/permissions.guard';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly assist: AiAssistService,
  ) {}

  @Get('summary/patient/:id')
  @RequirePermissions('ai.summary.read')
  @ApiOperation({
    summary: 'AI tóm tắt hồ sơ bệnh nhân (3 bullet: dị ứng, đang chờ, lần tới)',
  })
  async getPatientSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() raw: Record<string, unknown>,
    @User() actor: JwtPayload,
  ): Promise<{ data: AiPatientSummary }> {
    const { top, refresh } = SummaryQuerySchema.parse(raw);
    const data = await this.ai.getPatientSummary(id, top, refresh, actor);
    return { data };
  }

  @Post('drafts/clinical-note')
  @HttpCode(200)
  @RequirePermissions('clinical_note.write')
  @ApiOperation({
    summary: 'AI viết lại ghi nhanh của bác sĩ thành ghi chú khám (nháp, không lưu)',
  })
  async draftNote(@Body() dto: NoteDraftDto, @User() actor: JwtPayload) {
    return { data: await this.assist.draftNote(dto.encounterId, dto.text, actor) };
  }

  @Post('drafts/message')
  @HttpCode(200)
  @RequirePermissions('appointment.read.any', 'recall.read', 'recall.manage')
  @ApiOperation({
    summary: 'AI soạn tin nhắn nhắc lịch, mời tái khám hoặc trả lời khách (nháp, không gửi)',
  })
  async draftMessage(@Body() dto: MessageDraftDto, @User() actor: JwtPayload) {
    return { data: await this.assist.draftMessage(dto, actor) };
  }

  @Get('report-commentary')
  @RequirePermissions('report.revenue.read')
  @ApiOperation({ summary: 'AI nhận xét báo cáo của một khoảng ngày (chỉ dùng số tổng)' })
  async reportCommentary(@Query() q: ReportCommentaryQueryDto) {
    return { data: await this.assist.reportCommentary(q.from, q.to, q.refresh ?? false) };
  }
}
