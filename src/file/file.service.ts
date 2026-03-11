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

const LOAN_FILE_PATTERNS = [
  'DEBT_ACK_',
  'PROMISSORY_',
  'SETTLEMENT_',
  'إقرار الدين',
  'سند لأمر',
  'تسوية',
  'DEBT_ACKNOWLEDGMENT',
  'PROMISSORY_NOTE',
  'SETTLEMENT',
  'LN%20-',
  'LN -',
  'LN-',
];

const REPAYMENT_FILE_PATTERNS = [
  'REPAYMENT_',
  'PAYMENT_PROOF_',
  'BULK_PAYMENT_PROOF_',
  'repayment',
  'دفعة',
  'سداد',
  'اثبات',
];

const WITHDRAWAL_FILE_PATTERNS = [
  'WITHDRAWAL_RECEIPT_',
  'VOUCHER_',
  'withdrawals',
  'مخالصة',
  'سند_صرف',
];

@Injectable()
export class FileService {
  getFileModuleFromUrl(url: string): string | null {
    if (!url) return null;
    
    const decodedUrl = decodeURIComponent(url);
    
    for (const pattern of LOAN_FILE_PATTERNS) {
      if (decodedUrl.includes(pattern) || url.includes(pattern)) {
        return 'files-loans';
      }
    }
    
    for (const pattern of REPAYMENT_FILE_PATTERNS) {
      if (decodedUrl.toLowerCase().includes(pattern) || url.toLowerCase().includes(pattern)) {
        return 'files-repayments';
      }
    }
    
    for (const pattern of WITHDRAWAL_FILE_PATTERNS) {
      if (decodedUrl.includes(pattern) || url.includes(pattern)) {
        return 'files-partners-withdraw';
      }
    }
    
    for (const [pathPattern, module] of Object.entries(FILE_PATH_TO_MODULE)) {
      if (url.includes(pathPattern)) {
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
      let decodedPathname = parsed.pathname;
      
      try {
        decodedPathname = decodeURIComponent(parsed.pathname);
      } catch {
        // If decoding fails, use original pathname
      }
      
      const filePath = path.join(process.cwd(), decodedPathname);
      const normalizedPath = path.normalize(filePath);
      const projectRoot = path.normalize(process.cwd());

      if (!normalizedPath.startsWith(projectRoot)) {
        throw new BadRequestException('Access denied: Path outside project root');
      }

      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('الملف غير موجود');
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
