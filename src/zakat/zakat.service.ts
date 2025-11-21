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

    async getYearlyAllPartners(year: number, page: number = 1, limit?: number) {
        const pageLimit = limit && limit > 0 ? limit : 10;
        const skip = (page - 1) * pageLimit;

        // Count only partners that have zakah data for the specified year
        // (either accruals or payments)
        const totalPartners = await this.prisma.partner.count({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
        });

        const totalPages = Math.ceil(totalPartners / pageLimit);

        if (page > totalPages && totalPartners > 0) {
            throw new NotFoundException('Page not found');
        }

        // If no partners have data for this year, return empty result
        if (totalPartners === 0) {
            return {
                data: [],
                pagination: {
                    totalPartners: 0,
                    totalPages: 0,
                    currentPage: page,
                    limit: pageLimit,
                    hasNextPage: false,
                    hasPreviousPage: false,
                },
            };
        }

        // Get partners with pagination (only those with zakah data for the year)
        const partners = await this.prisma.partner.findMany({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
            skip,
            take: pageLimit,
            orderBy: { id: 'asc' },
            include: {
                ZakatAccrual: {
                    where: { year }, // Filter accruals by the specified year
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

            // Sum zakat payments for this partner/year (filtered by year)
            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year }, // Filter payments by the specified year
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

        return {
            data: results,
            pagination: {
                totalPartners,
                totalPages,
                currentPage: page,
                limit: pageLimit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }
}