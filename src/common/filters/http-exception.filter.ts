import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/** خريطة أسماء الحقول الإنجليزية إلى العربية */
const FIELD_NAMES_AR: Record<string, string> = {
  clientIdImage: 'بطاقة هوية العميل',
  clientWorkCard: 'بطاقة عمل العميل',
  salaryReport: 'تقرير الراتب',
  simaReport: 'تقرير ساما',
  nationalId: 'رقم الهوية',
  email: 'البريد الإلكتروني',
  phone: 'رقم الهاتف',
  name: 'الاسم',
  kafeelIdImage: 'صورة هوية الكفيل',
  kafeelWorkCard: 'بطاقة عمل الكفيل',
  profileImage: 'صورة الملف الشخصي',
  amount: 'المبلغ',
  password: 'كلمة المرور',
};

/** خريطة رموز أخطاء Prisma إلى رسائل عربية */
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2002: 'القيمة المدخلة مكررة بالفعل',
  P2003: 'المرجع غير موجود',
  P2025: 'السجل غير موجود',
  P2014: 'انتهاك قيد العلاقة',
  P2011: 'انتهاك قيد التحقق من صحة البيانات',
  P2012: 'قيمة مطلوبة مفقودة',
  P2016: 'استعلام غير صالح',
};

/** ترجمة رسائل التحقق الشائعة (class-validator) إلى العربية */
const VALIDATION_MESSAGES_AR: Record<string, string> = {
  'must be an email': 'البريد الإلكتروني غير صالح',
  'must be a string': 'يجب أن يكون نصاً',
  'must be a number': 'يجب أن يكون رقماً',
  'must not be empty': 'هذا الحقل مطلوب',
  'should not be empty': 'هذا الحقل مطلوب',
  'is required': 'هذا الحقل مطلوب',
  'must be longer than': 'القيمة قصيرة جداً',
  'must be shorter than': 'القيمة طويلة جداً',
  'must be a positive number': 'يجب أن يكون المبلغ موجباً',
  invalid: 'قيمة غير صالحة',
};

function getFieldNameAr(field: string): string {
  return FIELD_NAMES_AR[field] || field;
}

function parsePrismaValidationMessage(message: string): string {
  const nullMatch = message.match(/Argument `(\w+)` must not be null/i);
  if (nullMatch) {
    const field = nullMatch[1];
    return `${getFieldNameAr(field)} مطلوب ولا يمكن أن يكون فارغاً`;
  }

  const requiredMatch = message.match(/Argument `(\w+)` is required/i);
  if (requiredMatch) {
    const field = requiredMatch[1];
    return `${getFieldNameAr(field)} مطلوب`;
  }

  const invalidTypeMatch = message.match(/Argument `(\w+)`: Invalid value/i);
  if (invalidTypeMatch) {
    const field = invalidTypeMatch[1];
    return `قيمة ${getFieldNameAr(field)} غير صالحة`;
  }

  return 'بيانات غير صالحة، يرجى التحقق من المدخلات';
}

function isPrismaError(err: unknown): boolean {
  return !!(
    err &&
    typeof err === 'object' &&
    'name' in err &&
    typeof (err as { name: string }).name === 'string' &&
    (err as { name: string }).name.includes('Prisma')
  );
}

function translateValidationMessage(msg: string): string {
  const lower = msg.toLowerCase();
  for (const [en, ar] of Object.entries(VALIDATION_MESSAGES_AR)) {
    if (lower.includes(en)) return ar;
  }
  return msg;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'حدث خطأ غير متوقع';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const msg = (res as { message?: string | string[] }).message;
        const raw = Array.isArray(msg) ? msg[0] : msg || message;
        message =
          typeof raw === 'string'
            ? translateValidationMessage(raw)
            : raw || message;
      } else if (typeof res === 'string') {
        message = translateValidationMessage(res);
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = parsePrismaValidationMessage(exception.message);
      this.logger.warn(`Prisma Validation: ${exception.message}`);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.BAD_REQUEST;
      message =
        PRISMA_ERROR_MESSAGES[exception.code] ||
        parsePrismaValidationMessage(exception.message);
      this.logger.warn(
        `Prisma Known Error [${exception.code}]: ${exception.message}`,
      );
    } else if (isPrismaError(exception) && exception instanceof Error) {
      status = HttpStatus.BAD_REQUEST;
      message = parsePrismaValidationMessage(exception.message);
      this.logger.warn(`Prisma Error: ${exception.message}`);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً';
    }

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}
