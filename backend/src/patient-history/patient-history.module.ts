import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import {
  PatientHistoryLinkController,
  PublicPatientHistoryController,
} from './patient-history.controller';
import { PatientHistoryService } from './patient-history.service';

@Module({
  imports: [MessagingModule],
  controllers: [PatientHistoryLinkController, PublicPatientHistoryController],
  providers: [PatientHistoryService],
})
export class PatientHistoryModule {}
