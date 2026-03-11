import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

const FILE_PATH_TO_MODULE: Record<string, string> = {
  'uploads/clients': 'files-clients',
  'uploads/partners': 'files-partners',
  'uploads/expenses': 'files-expenses',
  'uploads/zakat': 'files-zakat',
  'uploads/profiles': 'files-clients',
};

@Injectable()
export class FileService {
  getFileModuleFromUrl(url: string): string | null {
    if (!url) return null;
    
    for (const [pathPattern, module] of Object.entries(FILE_PATH_TO_MODULE)) {
      if (url.includes(pathPattern)) {
        if (url.includes('repayments')) return 'files-repayments';
        if (url.includes('withdrawals')) return 'files-partners-withdraw';
        if (url.includes('loans') || url.includes('loan')) return 'files-loans';
        return module;
      }
    }
    return null;
  }

  validateAndGetFilePath(url: string): string {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    try {
      const parsed = new URL(url);
      const filePath = path.join(process.cwd(), parsed.pathname);

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
