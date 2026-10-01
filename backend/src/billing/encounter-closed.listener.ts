import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { ENCOUNTER_CLOSED_EVENT, EncounterClosedEvent } from '../common/events/domain-events';

/**
 * Subscribes to encounter.closed events (BR-MR-005 / BR-BILL-001) and
 * auto-creates a DRAFT invoice with one line per treatment. Idempotent —
 * the service returns the encounter's non-voided invoice if there is one.
 */
@Injectable()
export class EncounterClosedListener {
  private readonly logger = new Logger(EncounterClosedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @OnEvent(ENCOUNTER_CLOSED_EVENT)
  async handleEncounterClosed(payload: EncounterClosedEvent) {
    try {
      const result = await this.billing.createDraftFromEncounter(
        payload.encounterId,
        payload.treatments ?? [],
      );
      if (result) {
        this.logger.log(
          `Created DRAFT invoice ${result.code} for encounter ${payload.encounterId}`,
        );
      } else if ((payload.treatments ?? []).length === 0) {
        // Nothing to bill: no 0đ draft clutters the list (A5-17).
        this.logger.log(`Encounter ${payload.encounterId} closed with no treatment; no invoice`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to create invoice from encounter ${payload.encounterId}: ${msg}`);
      // The close is already committed; BillingCron drafts the missing
      // invoice later and the front desk can "tạo bù" it (A2-03).
    }
  }
}
