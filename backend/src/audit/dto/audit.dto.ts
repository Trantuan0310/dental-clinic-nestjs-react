export class CreateAuditLogDto {
  action!: string;
  actorUserId?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export class ListAuditLogsQueryDto {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  targetType?: string;
  targetId?: string;
  limit?: number;
  cursor?: string;
  pageSize?: number;
}
