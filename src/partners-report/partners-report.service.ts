import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PartnersReportService {
    constructor(private prisma: PrismaService) { }


    async getAllPartners(page: number, limit = 20) {
        const skip = (page - 1) * limit;

        const partners = await this.prisma.partner.findMany({
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                loans: true,
                transactions: true,
                profitAccruals: true,
                ZakatAccrual: true,
                ZakatPayment: true,
            },
        });

        const result = partners.map((p) => {
            const payableBalance = p.AccountPayable?.balance || 0;
            const equityBalance = p.AccountEquity?.balance || 0;

            return {
                id: p.id,
                name: p.name,
                phone: p.phone,
                nationalId: p.nationalId,
                capitalAmount: p.capitalAmount,
                totalProfit: p.totalProfit,
                totalAmount: p.totalAmount,
                accountBalance: payableBalance + equityBalance,
                loansCount: p.loans.length,
                totalDeposits: p.transactions
                    .filter(t => t.type === 'DEPOSIT')
                    .reduce((s, t) => s + t.amount, 0),
                totalWithdrawals: p.transactions
                    .filter(t => t.type === 'WITHDRAWAL')
                    .reduce((s, t) => s + t.amount, 0),
                totalAccruedProfit: p.profitAccruals.reduce((s, a) => s + a.partnerFinal, 0),
                zakat: {
                    required: p.yearlyZakatRequired || 0,
                    paid: p.yearlyZakatPaid || 0,
                    balance: p.yearlyZakatBalance || 0,
                },
            };
        });

        const total = await this.prisma.partner.count();

        return {
            page,
            limit,
            totalPartners: total,
            data: result,
        };
    }


    async getPartnerDetails(id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                loans: {
                    include: {
                        LoanPartnerShare: true,
                    },
                },
                transactions: true,
                profitAccruals: {
                    include: {
                        loan: true,
                        repayment: true,
                        period: true,
                    },
                },
                PartnerPeriodProfit: {
                    include: {
                        savings: true,
                    },
                },
                ZakatAccrual: true,
                ZakatPayment: true,
                PartnerSavingAccrual: {
                    include: {
                        accrual: true,
                    },
                },
            },
        });

        if (!partner) throw new NotFoundException('Partner not found');


        const totalLoans = partner.loans.length;
        const activeLoans = partner.loans.filter(l => l.status === "ACTIVE").length;
        const completedLoans = partner.loans.filter(l => l.status === "COMPLETED").length;
        const totalLoanAmount = partner.loans.reduce(
            (sum, loan) => sum + (loan.newAmount ?? loan.totalAmount),
            0
        );


        const totalDeposits = partner.transactions
            .filter(t => t.type === "DEPOSIT")
            .reduce((s, t) => s + t.amount, 0);

        const totalWithdrawals = partner.transactions
            .filter(t => t.type === "WITHDRAWAL")
            .reduce((s, t) => s + t.amount, 0);


        const totalRawShare = partner.profitAccruals.reduce((s, a) => s + a.rawShare, 0);
        const totalCompanyCut = partner.profitAccruals.reduce((s, a) => s + a.companyCut, 0);
        const totalPartnerProfit = partner.profitAccruals.reduce((s, a) => s + a.partnerFinal, 0);

        const distributedProfit = partner.profitAccruals
            .filter(a => a.isDistributed)
            .reduce((s, a) => s + a.partnerFinal, 0);

        const undistributedProfit = totalPartnerProfit - distributedProfit;



        const totalSavings = partner.PartnerSavingAccrual.reduce((s, a) => s + Number(a.savingAmount), 0);
        const periodsWithSavings = partner.PartnerSavingAccrual.length;



        const totalPeriodProfits = partner.PartnerPeriodProfit.reduce((s, p) => s + p.totalProfit, 0);
        const periodsCount = partner.PartnerPeriodProfit.length;



        const totalZakatAccrued = Math.round(
            partner.ZakatAccrual.reduce((s, a) => s + a.amount, 0) * 100
        ) / 100;

        const totalZakatPaid = Math.round(
            partner.ZakatPayment.reduce((s, p) => s + p.amount, 0) * 100
        ) / 100;

        const zakatBalance = totalZakatAccrued - totalZakatPaid;


        return {

            profile: {
                id: partner.id,
                name: partner.name,
                nationalId: partner.nationalId,
                phone: partner.phone,
                address: partner.address,
                email: partner.email,
                orgProfitPercent: partner.orgProfitPercent,
                capitalAmount: partner.capitalAmount,
                totalProfit: partner.totalProfit,
                totalAmount: partner.totalAmount,
                createdAt: partner.createdAt,
            },

            loans: partner.loans,
            transactions: partner.transactions,
            periodProfits: partner.PartnerPeriodProfit,


            summary: {
                loans: {
                    totalLoans,
                    activeLoans,
                    completedLoans,
                    totalLoanAmount,
                },
                transactions: {
                    totalDeposits,
                    totalWithdrawals,
                },
                profits: {
                    totalRawShare,
                    totalCompanyCut,
                    totalPartnerProfit,
                    distributedProfit,
                    undistributedProfit,
                },
                savings: {
                    totalSavings,
                    periodsWithSavings,
                },
                periodProfits: {
                    totalPeriodProfits,
                    periodsCount,
                },
                zakat: {
                    totalZakatAccrued,
                    totalZakatPaid,
                    zakatBalance,
                },
            },
        };
    }

    async getPartnerExportData(id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
                AccountNewCapital: true,
                PartnerNewCapital: true,
                loans: {
                    include: {
                        LoanPartnerShare: true,
                    },
                },
                transactions: true,
                profitAccruals: {
                    include: {
                        loan: true,
                        repayment: true,
                        period: true,
                    },
                },
                PartnerPeriodProfit: {
                    include: {
                        savings: true,
                    },
                },
                ZakatAccrual: true,
                ZakatPayment: true,
                PartnerSavingAccrual: {
                    include: {
                        accrual: true,
                    },
                },
            },
        });

        if (!partner) throw new NotFoundException('Partner not found');


        const newCapitalAmount = partner.PartnerNewCapital?.reduce(
            (sum, nc) => sum + nc.remaining,
            0,
        ) || 0;


        const allNewCapital = await this.prisma.partnerNewCapital.aggregate({
            _sum: { remaining: true },
        });
        const totalNewCapital = allNewCapital._sum.remaining || 0;
        const newCapitalPercent =
            totalNewCapital > 0 && partner.joinDistribute
                ? Number(((newCapitalAmount / totalNewCapital) * 100).toFixed(2))
                : 0;


        const totalSaving = Number(partner.AccountSaving?.credit ?? 0);
        const totalAvilableSaving = Number(partner.AccountSaving?.balance ?? 0);
        const totalWithdrawal = Number(partner.AccountSaving?.debit ?? 0);


        const total = newCapitalAmount + partner.totalAmount;


        const totalLoans = partner.loans.length;
        const activeLoans = partner.loans.filter((l) => l.status === 'ACTIVE').length;
        const completedLoans = partner.loans.filter((l) => l.status === 'COMPLETED').length;
        const totalLoanAmount = partner.loans.reduce(
            (sum, loan) => sum + (loan.newAmount ?? loan.totalAmount ?? 0),
            0,
        );


        const totalDeposits = partner.transactions
            .filter((t) => t.type === 'DEPOSIT')
            .reduce((s, t) => s + t.amount, 0);
        const totalWithdrawals = partner.transactions
            .filter((t) => t.type === 'WITHDRAWAL')
            .reduce((s, t) => s + t.amount, 0);


        const totalCompanyCut = partner.profitAccruals.reduce((s, a) => s + a.companyCut, 0);
        const totalPartnerProfit = partner.profitAccruals.reduce((s, a) => s + a.partnerFinal, 0);
        const distributedProfit = partner.profitAccruals
            .filter((a) => a.isDistributed)
            .reduce((s, a) => s + a.partnerFinal, 0);
        const undistributedProfit = totalPartnerProfit - distributedProfit;


        const totalZakatAccrued =
            Math.round(partner.ZakatAccrual.reduce((s, a) => s + a.amount, 0) * 100) / 100;
        const totalZakatPaid =
            Math.round(partner.ZakatPayment.reduce((s, p) => s + p.amount, 0) * 100) / 100;
        const zakatBalance = totalZakatAccrued - totalZakatPaid;


        const transactions = partner.transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            date: t.date,
            reference: t.reference,
        }));


        const loans = partner.loans.map((l) => ({
            id: l.id,
            code: l.code,
            amount: l.amount,
            totalAmount: l.totalAmount,
            newAmount: l.newAmount,
            status: l.status,
        }));

        return {
            id: partner.id,
            name: partner.name,
            nationalId: partner.nationalId,
            phone: partner.phone || '-',
            email: partner.email || 'لا يوجد',
            address: partner.address || '-',
            city: partner.city || '-',
            capitalAmount: partner.capitalAmount,
            newCapitalAmount,
            newCapitalPercent,
            total,
            totalAmount: partner.totalAmount,
            totalProfit: partner.totalProfit,
            upcomingProfit: partner.upcomingProfit,
            totalSaving,
            totalAvilableSaving,
            totalWithdrawal,
            orgProfitPercent: partner.orgProfitPercent,
            partnerProfitPercent: 100 - partner.orgProfitPercent,
            yearlyZakatRequired: partner.yearlyZakatRequired ?? 0,
            yearlyZakatPaid: partner.yearlyZakatPaid ?? 0,
            yearlyZakatBalance: partner.yearlyZakatBalance ?? 0,
            createdAt: partner.createdAt,
            isActive: partner.isActive,
            transactions,
            loans,
            AccountEquity: partner.AccountEquity,
            AccountPayable: partner.AccountPayable,
            summary: {
                profits: {
                    totalCompanyCut,
                    totalPartnerProfit,
                    distributedProfit,
                    undistributedProfit,
                },
                transactions: {
                    totalDeposits,
                    totalWithdrawals,
                },
                zakat: {
                    totalZakatAccrued,
                    totalZakatPaid,
                    zakatBalance,
                },
                loans: {
                    totalLoans,
                    activeLoans,
                    completedLoans,
                    totalLoanAmount,
                },
            },
        };
    }
}
