import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessagingService } from './messaging.service';
import { messagingConfigProblems } from './messaging-config';

/**
 * Phone reminders (SMS / Zalo), when a channel is on: visits every hour,
 * recalls each morning. Each message goes out once (message_logs.dedupe_key).
 */
@Injectable()
export class MessagingCron implements OnModuleInit {
  private readonly logger = new Logger(MessagingCron.name);

  constructor(private readonly messaging: MessagingService) {}

  onModuleInit() {
    for (const problem of messagingConfigProblems()) this.logger.warn('Messaging: ' + problem);
  }

  @Cron('20 * * * *')
  async visitReminders() {
    await this.run('visit reminders', () => this.messaging.sendVisitReminders());
  }

  @Cron('15 9 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async recallReminders() {
    await this.run('recall reminders', () => this.messaging.sendRecallReminders());
  }

  private async run(what: string, job: () => Promise<{ due: number; sent: number }>) {
    try {
      const result = await job();
      if (result.due > 0) this.logger.log(`Phone ${what}: ${result.sent} of ${result.due}`);
    } catch (err: unknown) {
      this.logger.error(
        `Phone ${what} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
