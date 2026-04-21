import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoanStatus } from '@prisma/client';

@Injectable()
export class ClientStatusService {
    private static readonly FULLY_PAID_STATUSES = ['PAID', 'EARLY_PAID', 'COMPLETED', 'PARTIAL_PAID'];

    constructor(private readonly prisma: PrismaService) { }

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

        const unpaidOverdueCount = allRepayments.filter(
            (r) =>
                !ClientStatusService.FULLY_PAID_STATUSES.includes(r.status) &&
                r.dueDate < now
        ).length;

        const allPaid = allRepayments.every((r) =>
            ClientStatusService.FULLY_PAID_STATUSES.includes(r.status),
        );

        let newStatus: any = 'نشط';
        if (unpaidOverdueCount >= 6) {
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
