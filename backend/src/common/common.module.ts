import { Global, Module } from '@nestjs/common';
import { CacheModule } from './cache.module';
import { ApiRootController } from './api-root.controller';
import { HealthController } from './health.controller';
import { EmailService } from './services/email.service';
import { FileUploadService } from './services/file-upload.service';

@Global()
@Module({
  imports: [CacheModule],
  controllers: [HealthController, ApiRootController],
  providers: [EmailService, FileUploadService],
  exports: [EmailService, FileUploadService],
})
export class CommonModule {}
