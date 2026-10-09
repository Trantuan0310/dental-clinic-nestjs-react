import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { Prisma } from '@prisma/client';
import { endOfClinicDay, startOfClinicDay } from '../common/date-range.util';

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

    const where: Prisma.AuditLogWhereInput & Record<string, unknown> = {};

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
      // Clinic days (A6-27): a bare date means 00:00–23:59 Asia/Ho_Chi_Minh,
      // not UTC (which dropped 00:00–07:00 and took the next morning).
      where.occurredAt = {};
      if (from) {
        (where.occurredAt as Record<string, Date>).gte = startOfClinicDay(from);
      }
      if (to) {
        (where.occurredAt as Record<string, Date>).lte = endOfClinicDay(to);
      }
    }

    const conditions: Prisma.AuditLogWhereInput[] = [where];
    if (cursor) {
      const cursorLog = await this.prisma.auditLog.findUnique({
        where: { id: cursor },
        select: { id: true, occurredAt: true },
      });
      if (cursorLog) {
        // Keyset on (occurredAt, id): rows sharing the cursor's millisecond
        // are no longer skipped at a page boundary.
        conditions.push({
          OR: [
            { occurredAt: { lt: cursorLog.occurredAt } },
            { occurredAt: cursorLog.occurredAt, id: { lt: cursorLog.id } },
          ],
        });
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where: conditions.length > 1 ? { AND: conditions } : where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
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
