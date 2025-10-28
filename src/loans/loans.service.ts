import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { LoanStatus, LoanType, Prisma } from '@prisma/client';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class LoansService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // Create Loan
    async createLoan(dto: CreateLoanDto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Client not found');

        // Calculate total profit
        const profit = dto.amount * (dto.interestRate / 100);
        const total = dto.amount + profit;

        // Create loan record
        const loan = await this.prisma.loan.create({
            data: {
                clientId: dto.clientId,
                amount: dto.amount,
                interestRate: dto.interestRate,
                durationMonths: dto.durationMonths,
                type: dto.type,
                startDate: new Date(dto.startDate),
                status: LoanStatus.PENDING,
            },
        });

        // Generate repayments
        const repaymentCount =
            dto.type === LoanType.DAILY
                ? dto.durationMonths * 30
                : dto.type === LoanType.WEEKLY
                    ? dto.durationMonths * 4
                    : dto.durationMonths;

        const installmentAmount = total / repaymentCount;
        const repayments: Prisma.RepaymentCreateManyInput[] = [];
        const startDate = new Date(dto.startDate);

        for (let i = 1; i <= repaymentCount; i++) {
            const dueDate = new Date(startDate);
            if (dto.type === LoanType.DAILY) dueDate.setDate(startDate.getDate() + i);
            else if (dto.type === LoanType.WEEKLY) dueDate.setDate(startDate.getDate() + i * 7);
            else {
                dueDate.setMonth(startDate.getMonth() + i);
                if (dto.repaymentDay) {
                    dueDate.setDate(dto.repaymentDay);
                }
            }

            repayments.push({
                loanId: loan.id,
                dueDate,
                amount: installmentAmount,
                status: 'PENDING'
            });
        }

        await this.prisma.repayment.createMany({ data: repayments });

        return { message: 'Loan created successfully', loan };
    }

    // Activate Loan
    async activateLoan(id: number, userId?: number) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be activated');

        // Get Accounts
        const receivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });
        if (!receivable || !bank)
            throw new BadRequestException('Loan receivable and bank accounts must exist');

        // Create Journal Entry
        await this.journalService.createJournal(
            {
                reference: `LN-${loan.id}`,
                description: `Loan disbursement for client ${loan.clientId}`,
                type: 'GENERAL',
                lines: [
                    { accountId: receivable.id, debit: loan.amount, credit: 0, description: 'Loan receivable', clientId: loan.clientId },
                    { accountId: bank.id, debit: 0, credit: loan.amount, description: 'bank disbursed' },
                ],
            },
            userId,
        );

        await this.prisma.loan.update({
            where: { id },
            data: { status: LoanStatus.ACTIVE },
        });

        return { message: 'Loan activated and journal created', loanId: id };
    }

    // Get all loans
    async getAllLoans(page: number = 1, limit = 10, filters?: any) {
        const where: any = {};

        if (filters?.status) where.status = filters.status;
        if (filters?.clientName)
            where.client = { name: { contains: filters.clientName, mode: 'insensitive' } };

        const loans = await this.prisma.loan.findMany({
            where,
            include: { client: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const total = await this.prisma.loan.count({ where });
        return { total, page, limit, data: loans };
    }

    // Get single loan (with repayments)
    async getLoanById(id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true, client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');
        return loan;
    }

    // Update Loan
    async updateLoan(id: number, dto: UpdateLoanDto) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be updated');

        // Update loan
        const updated = await this.prisma.loan.update({
            where: { id },
            data: dto,
        });

        // If financial fields changed, regenerate repayments
        if (dto.amount || dto.interestRate || dto.durationMonths || dto.type , dto.repaymentDay) {
            await this.prisma.repayment.deleteMany({ where: { loanId: id } });

            const profit = updated.amount * (updated.interestRate / 100);
            const total = updated.amount + profit;

            const repaymentCount =
                updated.type === LoanType.DAILY
                    ? updated.durationMonths * 30
                    : updated.type === LoanType.WEEKLY
                        ? updated.durationMonths * 4
                        : updated.durationMonths;

            const installmentAmount = total / repaymentCount;
            const startDate = new Date(updated.startDate);
            const repayments: Prisma.RepaymentCreateManyInput[] = [];

            for (let i = 1; i <= repaymentCount; i++) {
                const dueDate = new Date(startDate);
                if (updated.type === LoanType.DAILY) dueDate.setDate(startDate.getDate() + i);
                else if (updated.type === LoanType.WEEKLY) dueDate.setDate(startDate.getDate() + i * 7);
                else {
                    dueDate.setMonth(startDate.getMonth() + i);
                    if (dto.repaymentDay) {
                        dueDate.setDate(dto.repaymentDay);
                    }
                }

                repayments.push({
                    loanId: updated.id,
                    dueDate,
                    amount: installmentAmount,
                    status: 'PENDING',
                });
            }

            await this.prisma.repayment.createMany({ data: repayments });
        }

        return { message: 'Loan updated successfully', updated };
    }

    // Delete Loan
    async deleteLoan(id: number) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be deleted');

        await this.prisma.repayment.deleteMany({ where: { loanId: id } });
        await this.prisma.loan.delete({ where: { id } });

        return { message: 'Loan deleted successfully' };
    }
}