import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingModule } from '../booking/booking.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { InboxService } from './inbox.service';
import { NotificationsCron } from './notifications.cron';

@Module({
  imports: [PrismaModule, BookingModule, AppointmentsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, InboxService, NotificationsCron],
})
export class NotificationsModule {}
