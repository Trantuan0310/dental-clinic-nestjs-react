import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { BookingService } from './booking.service';
import { BookingRequestsController, PublicBookingController } from './booking.controller';

@Module({
  imports: [PrismaModule, AuditModule, AppointmentsModule, PatientsModule],
  controllers: [PublicBookingController, BookingRequestsController],
  providers: [BookingService],
})
export class BookingModule {}
