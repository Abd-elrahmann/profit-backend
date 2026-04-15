import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto } from './dto/journal.dto';
import { JournalStatus, JournalSourceType, JournalType, AccountBasicType } from '@prisma/client';
import { LoansService } from '../loans/loans.service';

@Injectable()
export class OpeningJournalService {
    constructor(private readonly prisma: PrismaService,
        private readonly LoansService: LoansService
    ) { }

    private async handleClientAccount(
        tx: any,
        line: any,
        account: any,
        journalDto: CreateJournalDto,
        clients: any[],
        userId: number,
        journalId: number
    ) {
        if (journalDto.type !== JournalType.OPENING) return;

        const client = clients.find(c => c.accountId === account.id);

        if (!client) {
            throw new NotFoundException('لا يوجد عميل مرتبط بهذا الحساب');
        }

        const amount = line.debit || 0;
        if (amount <= 0) return;

        await this.LoansService.createLoan(userId, {
            clientId: client.id,
            amount,
            paymentAmount: amount,
            TotalInterest: 0,
            type: 'MONTHLY',
            source: 'GENERAL',
            InterestPercentage: 0,
            bankAccountId: 1,
            startDate: new Date().toISOString(),
            promissionaryDate: new Date().toISOString(),
            repaymentDay: new Date().toISOString(),
            isOpening: true,
            isOpeningJournalId: journalId,
        }
            , tx);
    }

    private async handleExpenseAccount(
        tx: any,
        line: any,
        account: any,
        journalDto: CreateJournalDto,
        userId: number
    ) {
        if (journalDto.type !== JournalType.OPENING) return;

        const amount = line.debit || 0;
        if (amount <= 0) return;

        await tx.expenseRecord.create({
            data: {
                userId,
                type: account.accountBasicType,
                amount,
                description: line.description || 'مصروف افتتاحي',
                openingJournalLineId: line.id,
                journalId: line.journalId,
            },
        });
    }

    private async handlePartnerAccount(
        tx: any,
        line: any,
        account: any,
        journalDto: CreateJournalDto,
        userId: number
    ) {
        if (journalDto.type !== JournalType.OPENING) return;

        const amount = line.credit || 0;
        if (amount <= 0) return;

        const partner = await tx.partner.findFirst({
            where: { accountEquityId: account.id },
        });

        if (!partner) {
            throw new NotFoundException('لا يوجد شريك مرتبط بهذا الحساب');
        }

        await tx.partner.update({
            where: { id: partner.id },
            data: {
                capitalAmount: amount,
                totalAmount: amount,
            },
        });

        if (amount <= 0) return;

        const zakatBase = amount;
        const annualZakat = Number((zakatBase * 0.025).toFixed(2));

        const currentYear = new Date().getFullYear();

        const startMonth = new Date().getMonth() + 1;
        const remainingMonths = 12 - startMonth + 1;

        const totalCents = Math.round(annualZakat * 100);
        const monthlyCents = Math.floor(totalCents / remainingMonths);
        const remainderCents = totalCents - monthlyCents * remainingMonths;

        for (let month = startMonth; month <= 12; month++) {
            let amountCents = monthlyCents;

            if (month === 12) {
                amountCents += remainderCents;
            }

            await tx.zakatAccrual.create({
                data: {
                    partnerId: partner.id,
                    year: currentYear,
                    month,
                    amount: amountCents / 100,
                },
            });
        }

        await tx.partner.update({
            where: { id: partner.id },
            data: {
                yearlyZakatRequired: annualZakat,
                yearlyZakatBalance: annualZakat,
            },
        });

        const zakatAccount = await tx.account.findUnique({
            where: { code: '20001' },
        });

        if (!zakatAccount) {
            throw new BadRequestException('zakat Account (20001) must exist first');
        }

        return [
            {
                accountId: partner.accountEquityId,
                debit: annualZakat,
                credit: 0,
                description: `إستحقاق زكاة لعام ${currentYear} - ${partner.name}`,
            },
            {
                accountId: zakatAccount.id,
                debit: 0,
                credit: annualZakat,
                description: `إستحقاق زكاة لعام ${currentYear} - ${partner.name}`,
            },
        ];
    }

    async createJournal(dto: CreateJournalDto, userId: number) {

        const user = await this.prisma.user.findUnique({ where: { id: userId } })

        let periodId = dto.periodId;

        if (!periodId) {
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });

            if (!currentPeriod) {
                throw new BadRequestException('No open period found. Please create a period first.');
            }

            periodId = currentPeriod.id;
        }

        const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

        const tolerance = 0.01;

        if (Math.abs(totalDebit - totalCredit) > tolerance) {
            throw new BadRequestException('القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن');
        }

        const accountIds = dto.lines.map(l => l.accountId);

        const accounts = await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: {
                id: true,
                nature: true,
                accountBasicType: true,
            },
        });

        const clients = await this.prisma.client.findMany({
            where: {
                accountId: { in: accountIds },
            },
        });

        return await this.prisma.$transaction(async (tx) => {

            const zakatAccount = await tx.account.findUnique({
                where: { code: '20001' },
            });

            if (!zakatAccount) {
                throw new BadRequestException('zakat Account (20001) must exist first');
            }

            const accountsMap = new Map(accounts.map(a => [a.id, a]));
            accountsMap.set(zakatAccount.id, zakatAccount);

            let extraLines: any[] = [];

            for (const line of dto.lines) {
                const account = accountsMap.get(line.accountId);
                if (!account) continue;

                if (account.accountBasicType === AccountBasicType.PARTNER_EQUITY) {
                    const zakatLines = await this.handlePartnerAccount(
                        tx,
                        line,
                        account,
                        dto,
                        userId
                    );

                    extraLines.push(...(zakatLines || []));
                }
            }

            const finalLines = [...dto.lines, ...extraLines];

            const totalDebit = finalLines.reduce(
                (sum, l) => sum + Math.round((l.debit || 0) * 100),
                0
            );

            const totalCredit = finalLines.reduce(
                (sum, l) => sum + Math.round((l.credit || 0) * 100),
                0
            );

            if (totalDebit !== totalCredit) {
                throw new BadRequestException('القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن');
            }

            const journal = await tx.journalHeader.create({
                data: {
                    periodId,
                    reference: dto.reference,
                    description: dto.description,
                    type: dto.type,
                    sourceType: dto.sourceType,
                    sourceId: dto.sourceId,
                    postedById: null,
                    voucherUrl: dto.voucherUrl ?? null,
                    lines: {
                        create: finalLines.map((line) => {
                            const account = accountsMap.get(line.accountId);

                            if (!account) {
                                throw new BadRequestException(`الحساب ${line.accountId} غير موجود`);
                            }

                            const balance =
                                account.nature === 'DEBIT'
                                    ? (line.debit || 0) - (line.credit || 0)
                                    : (line.credit || 0) - (line.debit || 0);

                            return {
                                accountId: line.accountId,
                                debit: line.debit || 0,
                                credit: line.credit || 0,
                                description: line.description,
                                clientId: line.clientId || null,
                                balance,
                            };
                        }),
                    },
                },
                include: { lines: true },
            });

            for (const createdLine of journal.lines) {
                const account = accounts.find(a => a.id === createdLine.accountId);

                if (!account) continue;

                switch (account.accountBasicType) {
                    case AccountBasicType.CLIENT:
                        await this.handleClientAccount(
                            tx,
                            createdLine,
                            account,
                            dto,
                            clients,
                            userId,
                            journal.id
                        );
                        break;

                    case AccountBasicType.EXPENSES:
                        await this.handleExpenseAccount(
                            tx,
                            createdLine,
                            account,
                            dto,
                            userId
                        );
                        break;

                    case AccountBasicType.PARTNER_EQUITY:
                        break;
                }
            }

            if (userId) {
                await tx.auditLog.create({
                    data: {
                        userId,
                        screen: 'Journals',
                        action: 'CREATE',
                        description: `قام المستخدم ${user?.name || 'غير معروف'} بإنشاء قيد افتتاحي برقم ${dto.reference}`,
                    },
                });
            }

            return {
                message: 'تم انشاء القيد بنجاح',
                journal,
            };
        });
    }
}