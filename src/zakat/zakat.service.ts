import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ZakatYearSummary = {
    partnerId: number;
    partnerName: string;
    capitalAmount: number;
    year: number;
    annualZakat: number;
    monthlyZakat: number;
    totalPaid: number;
    remaining: number;
    monthlyBreakdown: any[];
};

@Injectable()
export class ZakatService {
    constructor(private readonly prisma: PrismaService) { }

    // Get yearly zakat summary for a partner
    async getPartnerZakatSummary(partnerId: number, year?: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
        });

        if (!partner) throw new NotFoundException('Partner not found');

        const startMonth = partner.createdAt
            ? new Date(partner.createdAt).getMonth() + 1
            : 1;

        const remainingMonths = 12 - startMonth + 1;

        const annualZakat = partner.capitalAmount * 0.025;
        const monthlyZakat = annualZakat / remainingMonths;

        // Helper: build summary for a specific year
        const buildYearSummary = async (yr: number): Promise<ZakatYearSummary> => {
            const accruals = await this.prisma.zakatAccrual.findMany({
                where: { partnerId, year: yr },
                orderBy: { month: 'asc' },
            });

            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId, year: yr },
                _sum: { amount: true },
            });

            const paidAmount = payments._sum.amount || 0;
            const remaining = annualZakat - paidAmount;

            return {
                partnerId,
                partnerName: partner.name,
                capitalAmount: partner.capitalAmount,
                year: yr,
                annualZakat,
                monthlyZakat,
                totalPaid: paidAmount,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: accruals,
            };
        };

        // If year is provided → return that specific year
        if (year) {
            return await buildYearSummary(year);
        }

        // No year → return all years
        const allAccruals = await this.prisma.zakatAccrual.findMany({
            where: { partnerId },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        const distinctYears = [...new Set(allAccruals.map(a => a.year))];

        const results: ZakatYearSummary[] = [];

        for (const yr of distinctYears) {
            results.push(await buildYearSummary(yr));
        }
        return results;
    }

    async getYearlyAllPartners(year: number) {
        const partners = await this.prisma.partner.findMany({
            include: {
                ZakatAccrual: {
                    where: { year },
                    orderBy: { month: 'asc' },
                },
            },
        });

        const results: ZakatYearSummary[] = [];

        for (const p of partners) {
            const startMonth = p.createdAt
                ? new Date(p.createdAt).getMonth() + 1
                : 1;

            const remainingMonths = 12 - startMonth + 1;

            const annualZakat = p.capitalAmount * 0.025;
            const monthlyZakat = annualZakat / remainingMonths;

            // 🔹 Sum zakat payments for this partner/year
            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });

            const paidAmount = payments._sum.amount || 0;
            const remaining = annualZakat - paidAmount;

            results.push({
                partnerId: p.id,
                partnerName: p.name,
                capitalAmount: p.capitalAmount,
                year,
                annualZakat,
                monthlyZakat,
                totalPaid: paidAmount,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: p.ZakatAccrual,
            });
        }

        return results;
    }
}