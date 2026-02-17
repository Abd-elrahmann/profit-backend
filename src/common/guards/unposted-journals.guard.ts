import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UnpostedJournalsGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const unpostedJournals = await this.prisma.journalHeader.findFirst({
            where: {
                sourceType: { not: 'PERIOD_CLOSING' },
                status: { not: 'POSTED' },
            },
            select: { id: true, reference: true, status: true },
        });

        if (unpostedJournals) {
            throw new BadRequestException(
                `يوجد قيود غير معتمدة في النظام. يجب اعتماد جميع القيود قبل المتابعة. (رقم القيد: ${unpostedJournals.reference})`,
            );
        }

        return true;
    }
}