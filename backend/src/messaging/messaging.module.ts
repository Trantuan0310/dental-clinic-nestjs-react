import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingCron } from './messaging.cron';

@Module({
  imports: [PrismaModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingCron],
  exports: [MessagingService],
})
export class MessagingModule {}
