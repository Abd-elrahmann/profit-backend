import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class PartnerWithdrawService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    async withdrawPartner(
        partnerId: number,
        monthlyAmount: number,
        userId: number
    ) {
        if (!monthlyAmount || monthlyAmount <= 0) {
            throw new BadRequestException("قيمة السداد الشهري غير صحيحة");
        }
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                LoanPartnerShare: true,
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');
        if (partner.WithdrawingStatus !== 'ACTIVE')
            throw new BadRequestException('لا يمكن تنفيذ الانسحاب لهذا المستثمر الآن');

        if (partner.joinDistribute == true)
            throw new BadRequestException('لا يمكن تنفيذ الانسحاب لهذا المستثمر الآن');

        let partnerDefaultShare = 0;

        const remainingCapital = partner.totalAmount - partnerDefaultShare;

        await this.prisma.partner.update({
            where: { id: partnerId },
            data: {
                isActive: false,
                joinDistribute: false,
                WithdrawingStatus: 'WITHDRAWING',
                isFrozen: true,
                totalAmount: remainingCapital,
            },
        });

        // Record losses (default share)
        if (partnerDefaultShare > 0) {
            const lossAccount = await this.prisma.account.findFirst({
                where: { accountBasicType: 'LOSSES' },
            });

            if (!lossAccount) throw new BadRequestException('حساب الخسائر غير موجود');

            await this.journalService.createJournal(
                {
                    reference: `DEFAULT-${partnerId}-${Date.now()}`,
                    description: `خصم نصيب المساهم (${partner.name}) من خسائر التعثر`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountEquityId,
                            debit: partnerDefaultShare,
                            credit: 0,
                            description: 'خصم من رأس مال المساهم',
                        },
                        {
                            accountId: lossAccount.id,
                            debit: 0,
                            credit: partnerDefaultShare,
                            description: 'إثبات خسائر التعثر',
                        },
                    ],
                },
                userId,
            );
        }

        // Withdraw savings
        const savingsAmount = partner.AccountSaving.balance;

        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount) throw new BadRequestException('حساب الادخار (20002) يجب ان يكون موجود');

        if (savingsAmount > 0) {
            await this.journalService.createJournal(
                {
                    reference: `SAVING-${partnerId}-${Date.now()}`,
                    description: `صرف مدخرات المساهم ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountSavingId,
                            debit: savingsAmount,
                            credit: 0,
                            description: 'خصم المدخرات',
                        },
                        {
                            accountId: savingAccount.id,
                            debit: 0,
                            credit: savingsAmount,
                            description: 'صرف المدخرات',
                        },
                    ],
                },
                userId,
            );
        }

        let remaining = remainingCapital;
        const schedule = [] as any;
        const startDate = new Date();

        let monthIndex = 1;

        while (remaining > 0) {
            const amount =
                remaining - monthlyAmount > 0
                    ? monthlyAmount
                    : remaining;

            const payDate = new Date(startDate);
            payDate.setMonth(startDate.getMonth() + monthIndex);

            const s = await this.prisma.partnerWithdrawalSchedule.create({
                data: {
                    partnerId,
                    year: payDate.getFullYear(),
                    month: payDate.getMonth() + 1,
                    amount,
                    paidAmount: 0,
                    remaining: amount,
                    status: 'PENDING',
                    isPaid: false,
                },
            });

            schedule.push(s);
            remaining = parseFloat((remaining - amount).toFixed(2));
            monthIndex++;
        }

        const withdrawal = await this.prisma.partnerWithdrawal.create({
            data: {
                partnerId,
                totalCapital: partner.totalAmount,
                defaultShare: partnerDefaultShare,
                remainingCapital,
                savingAmount: savingsAmount,
            },
        });

        return {
            message: 'تم طلب انسحاب المساهم بنجاح',
            withdrawal,
            schedule,
            savingsAmount,
            partnerDefaultShare,
            remainingCapital,
        };
    }

    async getWithdrawalDetails(partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                PartnerWithdrawal: true,
            },
        });

        if (!partner) throw new NotFoundException("المستثمر غير موجود");

        if (!partner.PartnerWithdrawal)
            throw new NotFoundException("لا يوجد طلب انسحاب لهذا المساهم");

        const withdrawal = await this.prisma.partnerWithdrawal.findFirst({
            where: { partnerId },
        });

        const schedule = await this.prisma.partnerWithdrawalSchedule.findMany({
            where: { partnerId },
            orderBy: { id: "asc" },
        });

        const journals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: "PARTNER_WITHDRAWING",
                sourceId: partnerId,
            },
            include: {
                lines: true,
            },
            orderBy: { createdAt: "asc" },
        });

        const savingsAmount = partner.AccountSaving?.balance ?? 0;

        return {
            partner: {
                id: partner.id,
                name: partner.name,
                totalCapital: partner.totalAmount,
                savings: savingsAmount,
                withdrawingStatus: partner.WithdrawingStatus,
                isFrozen: partner.isFrozen,
            },

            withdrawal,
            schedule,
            journals,
        };
    }

    // Approve full payment
    async approveWithdrawalPayment(currentUser: number, scheduleId: number) {
        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: { partner: true },
        });
        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');
        if (schedule.isPaid) throw new BadRequestException('الدفعة مدفوعة بالفعل');

        const partner = schedule.partner;
        if (!partner) throw new NotFoundException('المستثمر المرتبط غير موجود');

        // compute amounts
        const carry = parseFloat((schedule.carryAmount || 0).toFixed(2));
        const ownRemaining = parseFloat((schedule.remaining ?? schedule.amount ?? 0).toFixed(2));
        const totalToPay = parseFloat((carry + ownRemaining).toFixed(2));
        if (totalToPay <= 0) throw new BadRequestException('لا يوجد مبلغ للدفع');

        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        if (!bankAccount) throw new BadRequestException('BANK account not found');

        if (!partner.accountEquityId) throw new BadRequestException('Partner equity account not configured');

        if (bankAccount.balance < totalToPay) throw new BadRequestException(`رصيد الصندوق غير كافي ,الرصيد المتاح هو ${bankAccount.balance}`);

        return await this.prisma.$transaction(async (tx) => {
            const createdJournalIds: number[] = [];

            if (carry > 0 && schedule.carryFromId) {
                const carryJournal = await this.journalService.createJournal(
                    {
                        reference: `PW-CARRY-${schedule.carryFromId}-TO-${schedule.id}-${Date.now()}`,
                        description: `صرف مبلغ محمول من جدول ${schedule.carryFromId} إلى جدول ${schedule.id} (جزء قديم)`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: schedule.carryFromId,
                        lines: [
                            {
                                accountId: partner.accountEquityId,
                                debit: carry,
                                credit: 0,
                                description: `خصم من رأس المال (مبلغ محمول من ${schedule.carryFromId})`,
                            },
                            {
                                accountId: bankAccount.id,
                                debit: 0,
                                credit: carry,
                                description: `صرف مبلغ محمول من ${schedule.carryFromId} عبر جدول ${schedule.id}`,
                            },
                        ],
                    },
                    currentUser,
                );
                await this.journalService.postJournal(carryJournal.journal.id, currentUser);
                createdJournalIds.push(carryJournal.journal.id);
            }

            if (ownRemaining > 0) {
                const ownJournal = await this.journalService.createJournal(
                    {
                        reference: `PW-APPR-${schedule.id}-${Date.now()}`,
                        description: `صرف الدفعة لجدول انسحاب ${schedule.id} (مبلغ جديد)`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: schedule.id,
                        lines: [
                            {
                                accountId: partner.accountEquityId,
                                debit: ownRemaining,
                                credit: 0,
                                description: 'خصم من رأس مال المساهم',
                            },
                            {
                                accountId: bankAccount.id,
                                debit: 0,
                                credit: ownRemaining,
                                description: 'صرف دفعة السحب',
                            },
                        ],
                    },
                    currentUser,
                );
                await this.journalService.postJournal(ownJournal.journal.id, currentUser);
                createdJournalIds.push(ownJournal.journal.id);
            }

            const updatedSchedule = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: parseFloat(((schedule.paidAmount || 0) + totalToPay).toFixed(2)),
                    remaining: 0,
                    status: 'PAID',
                    isPaid: true,
                    paidAt: new Date(),
                },
            });

            const unpaid = await tx.partnerWithdrawalSchedule.count({
                where: { partnerId: schedule.partnerId, isPaid: false },
            });
            if (unpaid === 0) {
                await tx.partner.update({
                    where: { id: partner.id },
                    data: {
                        WithdrawingStatus: 'WITHDRAWN'
                    }
                })
            }

            // Audit
            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'POST',
                    description: `قام المستخدم بالموافقة على صرف جدول انسحاب رقم ${scheduleId}`,
                },
            });

            return {
                message: 'تم صرف الدفعة بنجاح',
                schedule: updatedSchedule,
                journalIds: createdJournalIds,
            };
        });
    }

    // Reject a payment
    async rejectWithdrawalPayment(currentUser: number, scheduleId: number) {
        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: { partner: true },
        });
        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');

        if (!schedule.isPaid && (!schedule.paidAmount || schedule.paidAmount === 0)) {
            throw new BadRequestException('الدفعة غير مدفوعة أو لا توجد دفعات لتراجعها');
        }

        return await this.prisma.$transaction(async (tx) => {
            const ownJournals = await tx.journalHeader.findMany({
                where: {
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: schedule.id,
                },
            });

            const carryJournals = await tx.journalHeader.findMany({
                where: {
                    sourceType: 'PARTNER_WITHDRAWING',
                    reference: { contains: `-TO-${schedule.id}-` },
                },
            });

            const journalsToUndo = [...ownJournals, ...carryJournals];

            let carryPaid = 0;
            let ownPaid = 0;

            for (const j of journalsToUndo) {
                const lines = await tx.journalLine.findMany({ where: { journalId: j.id } });
                const creditSum = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
                if ((j.reference || '').includes(`-TO-${schedule.id}-`)) {
                    carryPaid += creditSum;
                } else if (j.sourceId === schedule.id) {
                    ownPaid += creditSum;
                } else {
                    ownPaid += creditSum;
                }

                try {
                    await this.journalService.unpostJournal(currentUser, j.id);
                } catch (e) {
                }
                await tx.journalLine.deleteMany({ where: { journalId: j.id } });
                await tx.journalHeader.delete({ where: { id: j.id } });
            }

            const carryJournalRecord = carryJournals[0];
            let restoreCarryAmount = 0;
            let restoreCarryFromId = null as any;
            if (carryJournalRecord) {
                restoreCarryAmount = carryPaid;
                restoreCarryFromId = carryJournalRecord.sourceId || 0;
            }

            const restoredRemaining = parseFloat(((schedule.amount ?? 0)).toFixed(2));

            const updated = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: 0,
                    remaining: restoredRemaining,
                    status: 'PENDING',
                    isPaid: false,
                    paidAt: null,
                    carryAmount: restoreCarryAmount,
                    carryFromId: restoreCarryFromId,
                },
            });

            const forwardedSchedules = await tx.partnerWithdrawalSchedule.findMany({
                where: { partnerId: schedule.partnerId, carryFromId: schedule.id },
                orderBy: [{ year: 'asc' }, { month: 'asc' }, { id: 'asc' }],
            });

            for (const fs of forwardedSchedules) {
                const forwardedAmt = fs.carryAmount || 0;
                if (!forwardedAmt || forwardedAmt <= 0) continue;
                await tx.partnerWithdrawalSchedule.update({
                    where: { id: fs.id },
                    data: {
                        carryAmount: 0,
                        carryFromId: null,
                        remaining: parseFloat(((fs.remaining ?? 0)).toFixed(2)),
                    },
                });
            }

            // audit log
            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'DELETE',
                    description: `قام المستخدم برفض/التراجع عن صرف جدول انسحاب رقم ${scheduleId}`,
                },
            });

            return { message: 'تم إلغاء الدفعة بنجاح', schedule: updated, undone: journalsToUndo.map(j => j.id) };
        });
    }

    // Helper: find next schedules for same partner after a given schedule    
    private async findNextSchedulesForPartnerAfter(schedule) {
        return this.prisma.partnerWithdrawalSchedule.findMany({
            where: {
                partnerId: schedule.partnerId,
                isPaid: false,
                OR: [
                    { year: { gt: schedule.year } },
                    {
                        AND: [
                            { year: schedule.year },
                            { month: { gt: schedule.month } },
                        ],
                    },
                    {
                        AND: [
                            { year: schedule.year },
                            { month: schedule.month },
                            { id: { gt: schedule.id } },
                        ],
                    },
                ],
            },
            orderBy: [
                { year: 'asc' },
                { month: 'asc' },
                { id: 'asc' },
            ],
        });
    }

    // PARTIAL PAYMENT
    async partialPayWithdrawal(currentUser: number, scheduleId: number, paidAmount: number) {
        if (!paidAmount || paidAmount <= 0) throw new BadRequestException('المبلغ المدفوع يجب أن يكون أكبر من صفر');

        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: { partner: true },
        });
        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');
        if (schedule.isPaid) throw new BadRequestException('الدفعة مدفوعة بالفعل');

        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        if (!bankAccount) throw new BadRequestException('BANK account not found');
        if (!schedule.partner?.accountEquityId) throw new BadRequestException('Partner equity account not configured');

        const nextSchedules = await this.findNextSchedulesForPartnerAfter(schedule);
        if (nextSchedules.length === 0) {
            throw new BadRequestException(
                'لا يمكن السداد الجزئي لآخر دفعة، يجب اعتماد الدفعة كاملة'
            );
        }

        let remainingToAllocate = parseFloat(paidAmount.toFixed(2));

        const originalCarry = parseFloat((schedule.carryAmount || 0).toFixed(2));
        const originalOwnRemaining = parseFloat(((schedule.remaining !== undefined && schedule.remaining !== null) ? schedule.remaining : schedule.amount).toFixed(2));

        const createdJournalIds: number[] = [];

        return await this.prisma.$transaction(async (tx) => {
            let allocatedToCarry = 0;
            if (originalCarry > 0) {
                const take = Math.min(originalCarry, remainingToAllocate);
                allocatedToCarry = parseFloat(take.toFixed(2));
                remainingToAllocate = parseFloat((remainingToAllocate - allocatedToCarry).toFixed(2));

                if (allocatedToCarry > 0 && schedule.carryFromId) {
                    const carryJournal = await this.journalService.createJournal({
                        reference: `PW-PARTIAL-CARRY-${schedule.carryFromId}-TO-${schedule.id}-${Date.now()}`,
                        description: `سداد جزئي لمبلغ محمول من جدول ${schedule.carryFromId} إلى جدول ${schedule.id}`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: schedule.carryFromId,
                        lines: [
                            { accountId: schedule.partner.accountEquityId, debit: allocatedToCarry, credit: 0, description: 'سداد جزء محمول' },
                            { accountId: bankAccount.id, debit: 0, credit: allocatedToCarry, description: 'صرف جزء محمول' },
                        ],
                    }, currentUser);
                    await this.journalService.postJournal(carryJournal.journal.id, currentUser);
                    createdJournalIds.push(carryJournal.journal.id);
                }
            }

            let allocatedToOwn = 0;
            if (remainingToAllocate > 0 && originalOwnRemaining > 0) {
                const take = Math.min(originalOwnRemaining, remainingToAllocate);
                allocatedToOwn = parseFloat(take.toFixed(2));
                remainingToAllocate = parseFloat((remainingToAllocate - allocatedToOwn).toFixed(2));

                if (allocatedToOwn > 0) {
                    const ownJournal = await this.journalService.createJournal({
                        reference: `PW-PARTIAL-${schedule.id}-${Date.now()}`,
                        description: `سداد جزئي لجدول انسحاب ${schedule.id}`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: schedule.id,
                        lines: [
                            { accountId: schedule.partner.accountEquityId, debit: allocatedToOwn, credit: 0, description: 'سداد جزئي' },
                            { accountId: bankAccount.id, debit: 0, credit: allocatedToOwn, description: 'صرف جزئي' },
                        ],
                    }, currentUser);
                    await this.journalService.postJournal(ownJournal.journal.id, currentUser);
                    createdJournalIds.push(ownJournal.journal.id);
                }
            }

            const carryLeft = parseFloat((originalCarry - allocatedToCarry).toFixed(2));
            const ownLeft = parseFloat((originalOwnRemaining - allocatedToOwn).toFixed(2));
            const totalToForward = parseFloat((Math.max(0, carryLeft) + Math.max(0, ownLeft)).toFixed(2));

            const updatedSchedule = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: parseFloat(((schedule.paidAmount || 0) + allocatedToCarry + allocatedToOwn).toFixed(2)),
                    remaining: 0,
                    carryAmount: 0,
                    carryFromId: null,
                    status: totalToForward === 0 ? 'PAID' : 'PARTIAL_PAID',
                    isPaid: true,
                    paidAt: new Date(),
                },
            });

            if (totalToForward > 0) {
                let left = totalToForward;
                const nextSchedules = await this.findNextSchedulesForPartnerAfter(schedule);
                for (const ns of nextSchedules) {
                    if (left <= 0) break;

                    const add = parseFloat(Math.min(left, Number.POSITIVE_INFINITY).toFixed(2));
                    await tx.partnerWithdrawalSchedule.update({
                        where: { id: ns.id },
                        data: {
                            carryAmount: (ns.carryAmount || 0) + add,
                            carryFromId: schedule.id,
                        },
                    });
                    left = parseFloat((left - add).toFixed(2));
                }
            }

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'UPDATE',
                    description: `سداد جزئي لجدول انسحاب ${scheduleId} بمبلغ ${paidAmount} (allocatedToCarry=${allocatedToCarry}, allocatedToOwn=${allocatedToOwn}, forwarded=${totalToForward})`,
                },
            });

            return {
                message: 'تم تسجيل السداد الجزئي بنجاح',
                schedule: updatedSchedule,
                journalIds: createdJournalIds,
                allocatedToCarry,
                allocatedToOwn,
                forwarded: totalToForward,
            };
        });
    }
}