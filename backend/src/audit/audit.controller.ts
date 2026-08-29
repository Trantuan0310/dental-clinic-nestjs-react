import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@ApiTags('admin/audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('system.audit.read')
  @ApiOperation({ summary: 'List audit logs' })
  @ApiResponse({ status: 200, description: 'List of audit logs' })
  async list(@Query() query: ListAuditLogsQueryDto) {
    const { actor, action, targetType, targetId, from, to, limit = 20, cursor } = query;

    const where: Record<string, unknown> = {};

    if (actor) {
      where.actorUserId = actor;
    }

    if (action) {
      where.action = action;
    }

    if (targetType) {
      where.targetType = targetType;
    }

    if (targetId) {
      where.targetId = targetId;
    }

    if (from || to) {
      where.occurredAt = {};
      if (from) {
        (where.occurredAt as Record<string, Date>).gte = new Date(from);
      }
      if (to) {
        (where.occurredAt as Record<string, Date>).lte = new Date(to);
      }
    }

    if (cursor) {
      const cursorLog = await this.prisma.auditLog.findUnique({
        where: { id: cursor },
        select: { occurredAt: true },
      });
      if (cursorLog) {
        where.occurredAt = {
          ...((where.occurredAt as Record<string, Date>) || {}),
          lt: cursorLog.occurredAt,
        };
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: data.map(log => ({
        id: log.id,
        actorUserId: log.actorUserId,
        actorEmailAtTime: log.actorEmailAtTime,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: log.metadata as Record<string, unknown> | null,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        occurredAt: log.occurredAt,
      })),
      pagination: {
        pageSize: limit,
        nextCursor: hasMore && data.length > 0 ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }
}
