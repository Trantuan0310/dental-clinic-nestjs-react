import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { ClinicPurpose, MEDIA_MAX_BYTES, MediaFile, MediaService } from './media.service';

// Multer keeps the upload in memory; anything past the limit is cut off and
// rejected before it reaches the service.
const upload = FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } });

@ApiTags('Public media')
@Controller('public/media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get('site')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async site() {
    return { data: await this.media.site() };
  }

  // Ids are new on every upload, so a photo never changes under its URL and
  // browsers may keep it for a year.
  @Get(':id')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  async file(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { mimeType, bytes } = await this.media.file(id);
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    return new StreamableFile(bytes, { type: mimeType, length: bytes.length });
  }
}

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('clinic')
  @RequirePermissions('site_media.manage')
  @UseInterceptors(upload)
  async uploadClinic(
    @UploadedFile() file: MediaFile | undefined,
    @Body('purpose') purpose: string,
    @Body('caption') caption: string | undefined,
    @User() actor: JwtPayload,
  ) {
    if (purpose !== 'CLINIC_HERO' && purpose !== 'CLINIC_GALLERY')
      throw new BadRequestException('purpose phải là CLINIC_HERO hoặc CLINIC_GALLERY');
    return { data: await this.media.uploadClinic(purpose as ClinicPurpose, file, caption, actor) };
  }

  @Post('dentists/:dentistId/photo')
  @RequirePermissions('dentist.update', 'dentist.update.own')
  @UseInterceptors(upload)
  async uploadDentistPhoto(
    @Param('dentistId', ParseUUIDPipe) dentistId: string,
    @UploadedFile() file: MediaFile | undefined,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.media.uploadDentistPhoto(dentistId, file, actor) };
  }

  @Delete(':id')
  @RequirePermissions('site_media.manage', 'dentist.update', 'dentist.update.own')
  async remove(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return { data: await this.media.remove(id, actor) };
  }
}
