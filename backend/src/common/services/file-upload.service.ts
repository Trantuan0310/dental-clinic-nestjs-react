import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadResult {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadOptions {
  maxSize?: number;
  allowedMimeTypes?: string[];
  directory?: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  private readonly defaultOptions: Required<UploadOptions> = {
    maxSize: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    directory: 'uploads',
  };

  private getUploadDir(subDir?: string): string {
    const baseDir = process.env.UPLOAD_DIR || this.defaultOptions.directory;
    const uploadDir = subDir ? path.join(baseDir, subDir) : baseDir;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  }

  async uploadFile(file: UploadedFile, options: UploadOptions = {}): Promise<UploadResult> {
    const opts = { ...this.defaultOptions, ...options };

    if (file.size > opts.maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${opts.maxSize} bytes`);
    }

    if (!opts.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(`File type ${file.mimetype} is not allowed`);
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${uuidv4()}${ext}`;
    const uploadDir = this.getUploadDir(opts.directory);
    const filepath = path.join(uploadDir, filename);

    await fs.promises.writeFile(filepath, file.buffer);

    const baseUrl = process.env.FRONTEND_URL || process.env.API_URL || 'http://localhost:3000';
    const url = `${baseUrl}/uploads/${filename}`;

    this.logger.log(`File uploaded: ${filename} (${file.size} bytes)`);

    return {
      url,
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async deleteFile(filename: string): Promise<void> {
    const uploadDir = this.getUploadDir();
    const filepath = path.join(uploadDir, filename);

    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
      this.logger.log(`File deleted: ${filename}`);
    }
  }

  getFilePath(filename: string): string {
    const uploadDir = this.getUploadDir();
    return path.join(uploadDir, filename);
  }
}
