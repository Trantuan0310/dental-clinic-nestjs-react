import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { DentistReviewsModule } from '../dentist-reviews/dentist-reviews.module';
import {
  PatientHistoryLinkController,
  PublicPatientHistoryController,
} from './patient-history.controller';
import { PatientHistoryService } from './patient-history.service';

@Module({
  imports: [MessagingModule, DentistReviewsModule],
  controllers: [PatientHistoryLinkController, PublicPatientHistoryController],
  providers: [PatientHistoryService],
})
export class PatientHistoryModule {}
