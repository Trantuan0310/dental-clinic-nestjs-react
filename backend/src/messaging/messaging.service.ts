import { Injectable, Logger } from '@nestjs/common';
import {
  AppointmentStatus,
  MessageChannel,
  MessageStatus,
  Prisma,
  RecallStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateOnly } from '../common/date-range.util';
import { formatVisitTime } from '../booking/clinic-time-format';
import { isQuietHour, REMINDER_AHEAD_MS } from '../booking/appointment-notices.service';
import {
  anyPhoneChannel,
  MessagingConfig,
  messagingConfigProblems,
  normalizeVnMobile,
  readMessagingConfig,
} from './messaging-config';
import { MessageTemplate, MockProvider, PhoneProvider } from './providers/phone-provider';
import { EsmsProvider } from './providers/esms.provider';
import { ZaloZnsProvider } from './providers/zalo-zns.provider';

/** Same window as the visit reminder email (appointment-notices.service.ts). */
const LAST_CALL_MS = 30 * 60_000;
const MIN_AHEAD_MS = 2 * 60 * 60_000;
const BATCH = 200;
/** A message that failed is tried by this many runs of its job in all. */
export const MESSAGE_MAX_ATTEMPTS = 3;

export interface PhoneSendInput {
  phone: string | null | undefined;
  template: MessageTemplate;
  text: string;
  params?: Record<string, string>;
  /** At most one message per key, ever. */
  dedupeKey: string;
  patientId?: string | null;
  targetType?: string;
  targetId?: string;
}

/**
 * The SMS / Zalo layer: one call sends a message over the channels the
 * clinic turned on (Zalo first, SMS when Zalo fails or is off), logs it in
 * message_logs, and never sends the same dedupeKey twice. With providers on
 * "mock" the message is only logged (MOCKED).
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  /** Read on every send, so a changed env (tests) applies at once. */
  env: NodeJS.ProcessEnv = process.env;

  constructor(private readonly prisma: PrismaService) {}

  config(): MessagingConfig {
    return readMessagingConfig(this.env);
  }

  /** The channels in the order they are tried. */
  providers(config = this.config()): PhoneProvider[] {
    const list: PhoneProvider[] = [];
    if (config.zalo === 'zns') list.push(new ZaloZnsProvider(this.env));
    if (config.zalo === 'mock') list.push(new MockProvider(MessageChannel.ZALO));
    if (config.sms === 'esms') list.push(new EsmsProvider(this.env));
    if (config.sms === 'mock') list.push(new MockProvider(MessageChannel.SMS));
    return list;
  }

  status() {
    const config = this.config();
    return { ...config, problems: messagingConfigProblems(this.env) };
  }

  /** null: nothing sent (no channel on, or this key was sent before). */
  async send(input: PhoneSendInput): Promise<MessageStatus | null> {
    const providers = this.providers();
    if (providers.length === 0) return null;
    const phone = normalizeVnMobile(input.phone);
    const base = {
      template: input.template,
      body: input.text,
      dedupeKey: input.dedupeKey,
      patientId: input.patientId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
    };
    // Claim the key first: a second run (or another instance) gets P2002.
    let logId: string;
    let attempt = 1;
    try {
      const row = await this.prisma.messageLog.create({
        data: {
          ...base,
          channel: providers[0].channel,
          provider: providers[0].name,
          recipient: phone ?? String(input.phone ?? '').slice(0, 30),
          status: MessageStatus.SKIPPED,
          ...(!phone && { error: 'Số điện thoại không phải số di động Việt Nam' }),
        },
        select: { id: true },
      });
      logId = row.id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // Sent (or being sent) before: only a failed one is tried again.
      const retry = await this.reclaimFailed(input.dedupeKey);
      if (!retry) return null;
      ({ id: logId, attempts: attempt } = retry);
    }
    if (!phone) return MessageStatus.SKIPPED;

    const errors: string[] = [];
    for (const provider of providers) {
      const result = await provider.send({
        phone,
        template: input.template,
        text: input.text,
        params: input.params ?? {},
        // A retry gets a new id: providers drop a repeated one.
        trackingId: attempt > 1 ? `${logId}-${attempt}` : logId,
      });
      if (result.ok) {
        const status = result.mocked ? MessageStatus.MOCKED : MessageStatus.SENT;
        await this.prisma.messageLog.update({
          where: { id: logId },
          data: {
            channel: provider.channel,
            provider: provider.name,
            status,
            providerId: result.providerId ?? null,
            error: errors.length ? errors.join(' | ').slice(0, 500) : null,
          },
        });
        return status;
      }
      errors.push(`${provider.name}: ${result.error ?? 'lỗi'}`);
    }
    await this.prisma.messageLog.update({
      where: { id: logId },
      data: { status: MessageStatus.FAILED, error: errors.join(' | ').slice(0, 500) },
    });
    this.logger.warn(`Message ${input.dedupeKey} failed: ${errors.join(' | ')}`);
    return MessageStatus.FAILED;
  }

  /** Takes a FAILED message back for another try, up to MESSAGE_MAX_ATTEMPTS in all. */
  private async reclaimFailed(dedupeKey: string) {
    const { count } = await this.prisma.messageLog.updateMany({
      where: { dedupeKey, status: MessageStatus.FAILED, attempts: { lt: MESSAGE_MAX_ATTEMPTS } },
      data: { status: MessageStatus.SKIPPED, attempts: { increment: 1 } },
    });
    if (count === 0) return null;
    return this.prisma.messageLog.findUnique({
      where: { dedupeKey },
      select: { id: true, attempts: true },
    });
  }

  /** Admin: a test message to a phone number. */
  async sendTest(phone: string) {
    const status = await this.send({
      phone,
      template: 'TEST',
      text: `${clinicName(this.env)}: tin nhắn thử từ hệ thống quản lý phòng khám.`,
      params: { clinic_name: clinicName(this.env) },
      dedupeKey: `test:${randomUUID()}`,
    });
    return { status };
  }

  async logs(page = 1, pageSize = 50) {
    const take = Math.min(Math.max(pageSize, 1), 200);
    const [rows, total] = await Promise.all([
      this.prisma.messageLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(page, 1) - 1) * take,
        take,
      }),
      this.prisma.messageLog.count(),
    ]);
    return { data: rows, total, page: Math.max(page, 1), pageSize: take };
  }

  /**
   * Hourly: a phone reminder for each visit in the reminder window (the
   * same visits that get the email), once per visit and start time.
   */
  async sendVisitReminders(now = new Date()) {
    const config = this.config();
    if (!anyPhoneChannel(config) || !config.visitReminders || isQuietHour(now))
      return { due: 0, sent: 0 };
    const visits = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        deletedAt: null,
        startAt: {
          gt: new Date(now.getTime() + LAST_CALL_MS),
          lte: new Date(now.getTime() + REMINDER_AHEAD_MS),
        },
        patient: { deletedAt: null, primaryPhone: { not: null } },
      },
      select: {
        id: true,
        startAt: true,
        createdAt: true,
        patientId: true,
        patient: { select: { fullName: true, primaryPhone: true } },
        dentist: { select: { fullName: true } },
      },
      orderBy: { startAt: 'asc' },
      take: BATCH,
    });
    let sent = 0;
    const due = visits.filter(v => v.startAt.getTime() - v.createdAt.getTime() >= MIN_AHEAD_MS);
    for (const v of due) {
      const when = formatVisitTime(v.startAt);
      const status = await this.send({
        phone: v.patient.primaryPhone,
        template: 'VISIT_REMINDER',
        text:
          `${clinicName(this.env)} nhắc lịch khám lúc ${when}` +
          (v.dentist?.fullName ? ` với ${v.dentist.fullName}` : '') +
          `. Cần dời lịch xin gọi ${clinicPhone(this.env)}.`,
        params: {
          customer_name: v.patient.fullName,
          appointment_time: when,
          dentist_name: v.dentist?.fullName ?? '',
          clinic_phone: clinicPhone(this.env),
        },
        dedupeKey: `visit-reminder:${v.id}:${v.startAt.toISOString()}`,
        patientId: v.patientId,
        targetType: 'appointment',
        targetId: v.id,
      });
      if (status === MessageStatus.SENT || status === MessageStatus.MOCKED) sent++;
    }
    return { due: due.length, sent };
  }

  /** Daily: a phone reminder for each recall due today or before, once per recall. */
  async sendRecallReminders(now = new Date()) {
    const config = this.config();
    if (!anyPhoneChannel(config) || !config.recallReminders || isQuietHour(now))
      return { due: 0, sent: 0 };
    const today = clinicDateOnly(now);
    const recalls = await this.prisma.recall.findMany({
      where: {
        status: RecallStatus.PENDING,
        dueDate: { lte: new Date(`${today}T00:00:00Z`) },
        patient: { deletedAt: null, recallOptOutAt: null, primaryPhone: { not: null } },
      },
      select: {
        id: true,
        patientId: true,
        patient: { select: { fullName: true, primaryPhone: true } },
        service: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: BATCH,
    });
    const booked = new Set(
      (
        await this.prisma.appointment.findMany({
          where: {
            patientId: { in: [...new Set(recalls.map(r => r.patientId))] },
            deletedAt: null,
            status: {
              in: [
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.CHECKED_IN,
                AppointmentStatus.IN_PROGRESS,
              ],
            },
            startAt: { gte: now },
          },
          select: { patientId: true },
        })
      ).map(a => a.patientId),
    );
    let sent = 0;
    const due = recalls.filter(r => !booked.has(r.patientId));
    for (const r of due) {
      const status = await this.send({
        phone: r.patient.primaryPhone,
        template: 'RECALL_REMINDER',
        text:
          `${clinicName(this.env)}: đã đến lịch tái khám định kỳ (${r.service.name}). ` +
          `Đặt lịch xin gọi ${clinicPhone(this.env)}.`,
        params: {
          customer_name: r.patient.fullName,
          service_name: r.service.name,
          clinic_phone: clinicPhone(this.env),
        },
        dedupeKey: `recall:${r.id}`,
        patientId: r.patientId,
        targetType: 'recall',
        targetId: r.id,
      });
      if (status === MessageStatus.SENT || status === MessageStatus.MOCKED) sent++;
    }
    return { due: due.length, sent };
  }
}

function clinicName(env: NodeJS.ProcessEnv) {
  return env.CLINIC_NAME?.trim() || 'Phòng khám';
}

function clinicPhone(env: NodeJS.ProcessEnv) {
  return env.CLINIC_PHONE?.trim() || 'phòng khám';
}
