import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FileService {
  validateAndGetFilePath(url: string): string {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    try {
      const parsed = new URL(url);
      const filePath = path.join(process.cwd(), parsed.pathname);

      // Security: Prevent directory traversal attacks
      const normalizedPath = path.normalize(filePath);
      const projectRoot = path.normalize(process.cwd());

      if (!normalizedPath.startsWith(projectRoot)) {
        throw new BadRequestException('Access denied: Path outside project root');
      }

      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('File not found');
      }

      return filePath;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Invalid URL format');
    }
  }
}
