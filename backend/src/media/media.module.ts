import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { MediaService } from './media.service';
import { MediaController, PublicMediaController } from './media.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PublicMediaController, MediaController],
  providers: [MediaService],
})
export class MediaModule {}
