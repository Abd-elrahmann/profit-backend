import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoanStatus } from '@prisma/client';

/**
 * خدمة موحدة لتحديث حالة العميل (نشط / متعثر / منتهي)
 * تُستخدم من جميع الوحدات لضمان اتساق المنطق
 */
@Injectable()
export class ClientStatusService {
    private static readonly FULLY_PAID_STATUSES = ['PAID', 'EARLY_PAID', 'COMPLETED', 'PARTIAL_PAID'];

    constructor(private readonly prisma: PrismaService) {}

    async updateClientStatus(clientId: number): Promise<void> {
        const loans = await this.prisma.loan.findMany({
            where: { clientId, status: LoanStatus.ACTIVE },
            include: { repayments: true },
        });

        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' as any },
            });
            return;
        }

        const allRepayments = loans.flatMap((l) => l.repayments);
        const now = new Date();

        const hasOverdue = allRepayments.some(
            (r) =>
                r.status === 'OVERDUE' ||
                (r.status === 'PENDING' && r.dueDate < now),
        );

        const allPaid = allRepayments.every((r) =>
            ClientStatusService.FULLY_PAID_STATUSES.includes(r.status),
        );

        let newStatus: any = 'نشط';
        if (hasOverdue) {
            newStatus = 'متعثر';
        } else if (allPaid) {
            newStatus = 'منتهي';
        }

        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }
}
