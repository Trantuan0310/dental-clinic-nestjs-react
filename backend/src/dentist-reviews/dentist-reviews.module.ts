import { Module } from '@nestjs/common';
import { DentistReviewsService } from './dentist-reviews.service';

/** Patients' ratings of dentists (migration 067). */
@Module({
  providers: [DentistReviewsService],
  exports: [DentistReviewsService],
})
export class DentistReviewsModule {}
