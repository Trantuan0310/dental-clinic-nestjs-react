import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmployeesService } from './employees.service';

/**
 * A5-12: carries out terminations planned for a date (terminationDate ahead)
 * just after clinic midnight, and once at startup in case the server was
 * down then (the job only acts on dates already reached, so it is a no-op
 * when run twice).
 */
@Injectable()
export class StaffCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(StaffCron.name);

  constructor(private readonly employees: EmployeesService) {}

  onApplicationBootstrap() {
    void this.finalizeScheduledTerminations();
  }

  @Cron('20 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async finalizeScheduledTerminations() {
    try {
      const { terminated } = await this.employees.finalizeScheduledTerminations();
      if (terminated > 0) this.logger.log(`Carried out ${terminated} planned terminations`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`finalizeScheduledTerminations failed: ${msg}`);
    }
  }
}
