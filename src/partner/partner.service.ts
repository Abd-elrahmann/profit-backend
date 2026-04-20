import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import * as fs from 'fs';
import * as path from 'path';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType, JournalStatus, JournalType } from '@prisma/client';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import moment from "moment-hijri";
dotenv.config();

@Injectable()
export class PartnerService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    async checkNationalIdExists(nationalId: string): Promise<boolean> {
        const existing = await this.prisma.partner.findFirst({
            where: { nationalId },
        });
        return !!existing;
    }

    async createPartner(currentUser, dto: CreatePartnerDto) {
        const existing = await this.prisma.partner.findFirst({
            where: { nationalId: dto.nationalId },
        });
        if (existing) throw new BadRequestException('المساهم برقم الهوية هذا موجود مسبقًا');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id: dto.BankId },
        });

        if (!bankAccount || !bankAccount.accountId) {
            throw new BadRequestException('حساب البنك غير موجود');
        };

        const liabilities = await this.prisma.account.findUnique({ where: { code: '20000' } });
        const equity = await this.prisma.account.findUnique({ where: { code: '30000' } });
        const bank = await this.prisma.account.findUnique({ where: { id: bankAccount.accountId } });
        const newCapitalBank = await this.prisma.account.findUnique({ where: { code: '11001' } });

        if (!liabilities || !equity || !bank || !newCapitalBank) {
            throw new BadRequestException('Base accounts (11000, 20000, 30000) must exist first');
        }

        const payableAccount = await this.prisma.account.create({
            data: {
                name: `مستحق - ${dto.name}`,
                code: await this.generateNextCode('2'),
                parentId: liabilities.id,
                type: 'LIABILITY',
                nature: 'CREDIT',
                accountBasicType: 'PARTNER_PAYABLE',
                level: 2,
            },
        });

        const equityAccount = await this.prisma.account.create({
            data: {
                name: `رأس مال - ${dto.name}`,
                code: await this.generateNextCode('3'),
                parentId: equity.id,
                type: 'EQUITY',
                nature: 'CREDIT',
                accountBasicType: 'PARTNER_EQUITY',
                level: 2,
            },
        });

        const savingAccount = await this.prisma.account.create({
            data: {
                name: `ادخار - ${dto.name}`,
                code: await this.generateNextCode('2'),
                parentId: liabilities.id,
                type: 'LIABILITY',
                nature: 'CREDIT',
                accountBasicType: 'PARTNER_SAVING',
                level: 2,
            },
        });

        const newCapitalAccount = await this.prisma.account.create({
            data: {
                name: `رأس مال جديد - ${dto.name}`,
                code: await this.generateNextCode('3'),
                parentId: equity.id,
                type: 'EQUITY',
                nature: 'CREDIT',
                accountBasicType: 'PARTNER_NEW_CAPITAL',
                level: 2,
            },
        });


        let capitalAmount = 0;
        if (dto.isNewPartner === true) {
            capitalAmount = 0;
        } else {
            capitalAmount = dto.capitalAmount;
        }

        const partner = await this.prisma.partner.create({
            data: {
                name: dto.name,
                nationalId: dto.nationalId,
                address: dto.address,
                city: dto.city,
                phone: dto.phone,
                email: dto.email,
                orgProfitPercent: dto.orgProfitPercent,
                capitalAmount: capitalAmount,
                totalAmount: capitalAmount,
                contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null,
                createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
                mudarabahFileUrl: dto.mudarabahFileUrl,
                isActive: dto.isActive ?? true,
                joinDistribute: dto.joinDistribute ?? true,
                isNewPartner: dto.isNewPartner ?? true,
                accountPayableId: payableAccount.id,
                accountEquityId: equityAccount.id,
                accountSavingId: savingAccount.id,
                accountNewCapitalId: newCapitalAccount.id,
                yearlyZakatRequired: Number((dto.capitalAmount * 0.025).toFixed(2)),
                yearlyZakatPaid: 0,
                yearlyZakatBalance: Number((dto.capitalAmount * 0.025).toFixed(2)),
                bankAccountId: dto.BankId,
            },
            include: {
                AccountPayable: true,
                AccountEquity: true,
            },
        });

        const isNew = partner.isNewPartner;

        if (dto.capitalAmount > 0) {
            let zakatBase = dto.capitalAmount;

            const startMonth = partner.createdAt
                ? new Date(partner.createdAt).getMonth() + 1
                : new Date().getMonth() + 1;

            const remainingMonths = 12 - startMonth + 1;

            const annualZakat = Number((zakatBase * 0.025).toFixed(2));

            const currentYear = new Date().getFullYear();

            const totalCents = Math.round(annualZakat * 100);
            const monthlyCents = Math.floor(totalCents / remainingMonths);
            const remainderCents = totalCents - monthlyCents * remainingMonths;

            for (let month = startMonth; month <= 12; month++) {
                let amountCents = monthlyCents;
                if (month === 12) {
                    amountCents += remainderCents;
                }
                await this.prisma.zakatAccrual.create({
                    data: {
                        partnerId: partner.id,
                        year: currentYear,
                        month,
                        amount: amountCents / 100,
                    },
                });
            }

            const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });

            if (!zakatAccount) {
                throw new BadRequestException('zakat Account (20001) must exist first');
            }

            const journalLines = isNew
                ? [
                    {
                        accountId: newCapitalBank.id,
                        debit: dto.capitalAmount,
                        credit: 0,
                        description: 'إيداع رأس مال (مساهم جديد)',
                    },
                    {
                        accountId: newCapitalAccount.id,
                        debit: 0,
                        credit: dto.capitalAmount,
                        description: `رأس مال جديد - ${partner.name}`,
                    },
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
                ]
                : [
                    {
                        accountId: bank.id,
                        debit: dto.capitalAmount,
                        credit: 0,
                        description: 'إيداع رأس مال (مساهم قديم)',
                    },
                    {
                        accountId: equityAccount.id,
                        debit: 0,
                        credit: dto.capitalAmount,
                        description: `رأس مال ${partner.name}`,
                    },
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

            const journal = await this.journalService.createJournal(
                {
                    reference: `CAP-${partner.id}`,
                    description: isNew
                        ? `إيداع رأس مال مساهم جديد ${partner.name}`
                        : `إيداع رأس مال مساهم قديم ${partner.name}`,
                    type: JournalType.OPENING,
                    sourceType: JournalSourceType.PARTNER,
                    sourceId: partner.id,
                    lines: journalLines,
                },
                currentUser,
            );

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUser);
            }
        }

        if (isNew) {
            await this.prisma.partnerNewCapital.create({
                data: {
                    partnerId: partner.id,
                    amount: dto.capitalAmount,
                    remaining: dto.capitalAmount,
                },
            });
        }

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء شريك جديد: ${partner.name} برأس مال ${partner.capitalAmount}`,
            },
        });
        return { message: 'تم اضافة مساهم جديد بنجاح', partner };
    }

    async updatePartner(currentUser: number, id: number, dto: UpdatePartnerDto) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountEquity: true,
                AccountNewCapital: true,
            },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        if (dto.isActive === false) dto.joinDistribute = false;
        if (dto.isActive === true) dto.joinDistribute = true;

        const contractSignedAt = dto.contractSignedAt
            ? new Date(dto.contractSignedAt)
            : partner.contractSignedAt;

        const createdAt = dto.createdAt
            ? new Date(dto.createdAt)
            : partner.createdAt;

        let bankAccountId = dto.BankId ?? partner.bankAccountId ?? undefined;

        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id: bankAccountId },
        });

        if (!bankAccount || !bankAccount.accountId) {
            throw new BadRequestException('حساب البنك غير موجود');
        };

        const bank = await this.prisma.account.findUnique({ where: { id: bankAccount.accountId } });
        const newCapitalBank = await this.prisma.account.findUnique({ where: { code: '11001' } });

        let amount = dto.capitalAmount || partner.capitalAmount;

        const updated = await this.prisma.$transaction(async (tx) => {
            const partnerUpdateData: any = {
                ...dto,
                contractSignedAt,
                createdAt,
                yearlyZakatRequired: Number((amount * 0.025).toFixed(2)),
                yearlyZakatBalance: Number((amount * 0.025).toFixed(2)),
            };

            if (partner.isNewPartner) {
                delete partnerUpdateData.capitalAmount;
                delete partnerUpdateData.totalAmount;
            }

            const updatedPartner = await tx.partner.update({
                where: { id },
                data: partnerUpdateData,
            });

            let oldCapitalAmount = 0;

            if (partner.isNewPartner) {
                const newCapital = await tx.partnerNewCapital.findFirst({
                    where: { partnerId: partner.id },
                    select: { amount: true },
                });

                oldCapitalAmount = newCapital?.amount ?? 0;
            } else {
                oldCapitalAmount = partner.capitalAmount + (partner.yearlyZakatRequired || 0);
            }

            if (dto.capitalAmount !== undefined && dto.capitalAmount !== oldCapitalAmount) {
                if (!partner.isNewPartner) {
                    await tx.partner.update({
                        where: { id },
                        data: {
                            capitalAmount: dto.capitalAmount,
                            totalAmount: dto.capitalAmount,
                        },
                    });
                } else {
                    await tx.partnerNewCapital.updateMany({
                        where: { partnerId: partner.id },
                        data: {
                            amount: dto.capitalAmount,
                            remaining: dto.capitalAmount,
                        },
                    });

                    await tx.partner.update({
                        where: { id: partner.id },
                        data: {
                            capitalAmount: 0,
                            totalAmount: 0,
                        },
                    });
                }
            }

            if (dto.capitalAmount !== undefined && dto.capitalAmount !== oldCapitalAmount) {

                let zakatBase = 0;
                if (partner.isNewPartner) {
                    const newCapital = await tx.partnerNewCapital.findMany({
                        where: { partnerId: partner.id },
                    });

                    zakatBase = newCapital.reduce((sum, c) => sum + c.remaining, 0);
                } else {
                    zakatBase = dto.capitalAmount;
                }

                const startMonth = partner.createdAt
                    ? new Date(partner.createdAt).getMonth() + 1
                    : new Date().getMonth() + 1;

                const remainingMonths = 12 - startMonth + 1;

                const annualZakat = Number((zakatBase * 0.025).toFixed(2));

                const currentYear = new Date().getFullYear();

                const totalCents = Math.round(annualZakat * 100);
                const monthlyCents = Math.floor(totalCents / remainingMonths);
                const remainderCents = totalCents - monthlyCents * remainingMonths;

                const accruals = [] as any;

                for (let month = startMonth; month <= 12; month++) {
                    let amountCents = monthlyCents;
                    if (month === 12) amountCents += remainderCents;

                    accruals.push({
                        partnerId: partner.id,
                        year: currentYear,
                        month,
                        amount: amountCents / 100,
                    });
                }

                await tx.zakatAccrual.deleteMany({
                    where: { partnerId: partner.id, year: currentYear },
                });

                await tx.zakatAccrual.createMany({
                    data: accruals,
                });

                const zakatAccount = await tx.account.findUnique({ where: { code: '20001' } });

                if (!zakatAccount) {
                    throw new BadRequestException('zakat Account (20001) must exist first');
                }


                const journal = await tx.journalHeader.findFirst({
                    where: {
                        sourceType: 'PARTNER',
                        sourceId: partner.id,
                        status: 'DRAFT',
                    },
                    include: { lines: true },
                });

                if (!journal) throw new BadRequestException('لا يمكن تعديل القيد لأنه معتمد');

                if (journal && dto.capitalAmount !== undefined) {
                    for (const line of journal.lines) {

                        if (partner.isNewPartner) {
                            if (line.accountId === newCapitalBank?.id) {
                                await tx.journalLine.update({
                                    where: { id: line.id },
                                    data: {
                                        debit: dto.capitalAmount,
                                        credit: 0,
                                        balance: dto.capitalAmount,
                                    },
                                });
                            }

                            if (line.accountId === partner.AccountNewCapital.id) {
                                await tx.journalLine.update({
                                    where: { id: line.id },
                                    data: {
                                        debit: 0,
                                        credit: dto.capitalAmount,
                                        balance: dto.capitalAmount,
                                    },
                                });
                            }
                        }

                        else {
                            if (line.accountId === bank?.id) {
                                await tx.journalLine.update({
                                    where: { id: line.id },
                                    data: {
                                        debit: dto.capitalAmount,
                                        credit: 0,
                                        balance: dto.capitalAmount,
                                    },
                                });
                            }

                            if (line.accountId === partner.AccountEquity.id &&
                                line.credit > 0) {
                                await tx.journalLine.update({
                                    where: { id: line.id },
                                    data: {
                                        debit: 0,
                                        credit: dto.capitalAmount,
                                        balance: dto.capitalAmount,
                                    },
                                });
                            }
                        }
                        if (line.accountId === zakatAccount.id) {
                            await tx.journalLine.update({
                                where: { id: line.id },
                                data: {
                                    debit: 0,
                                    credit: partnerUpdateData.yearlyZakatRequired,
                                    balance: (partnerUpdateData.yearlyZakatRequired) * -1,
                                },
                            });
                        }
                        if (line.accountId === partner.accountEquityId &&
                            line.debit > 0) {
                            await tx.journalLine.update({
                                where: { id: line.id },
                                data: {
                                    debit: partnerUpdateData.yearlyZakatRequired,
                                    credit: 0,
                                    balance: partnerUpdateData.yearlyZakatRequired,
                                },
                            });
                        }
                    }

                    await tx.journalHeader.update({
                        where: { id: journal.id },
                        data: {
                            description: `تعديل رأس المال لشريك ${partner.name}`,
                        },
                    });
                }

                await tx.auditLog.create({
                    data: {
                        userId: currentUser,
                        screen: 'Partners',
                        action: 'UPDATE',
                        description: `قام المستخدم ${user?.name} بتحديث بيانات الشريك: ${partner.name}`,
                    },
                });

                return updatedPartner;
            }
        }, { timeout: 60000 });

        return {
            message: 'تم تحديث بيانات المساهم بنجاح',
            partner: updated,
        };
    }

    async deletePartner(currentUser, id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: { AccountPayable: true, AccountEquity: true },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const journals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: JournalSourceType.PARTNER,
                sourceId: partner.id,
            },
            select: { id: true, status: true },
        });

        const postedJournal = journals.find(j => j.status === JournalStatus.POSTED);

        if (postedJournal) {
            throw new BadRequestException(
                'لا يمكن حذف الشريك لأنه يوجد قيد محاسبي معتمد'
            );
        }

        const active = await this.prisma.partnerShareAccrual.findMany({
            where: { partnerId: partner.id, isClosed: false, isDistributed: false },
        })

        if (active.length > 0) {
            throw new BadRequestException('لا يمكن حذف المستثمر');
        }

        try {
            const partnerDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId || 'unknown');
            if (fs.existsSync(partnerDir)) {
                fs.rmSync(partnerDir, { recursive: true, force: true });
            } else {
                console.warn(`⚠️ Folder not found for partners: ${partnerDir}`);
            }
        } catch (err) {
            console.warn('⚠️ Failed to delete partners folder:', (err as Error).message);
        }

        await this.prisma.$transaction(async (tx) => {

            const headersToDelete = await tx.journalHeader.findMany({
                where: {
                    lines: { some: { accountId: { in: [partner.accountPayableId, partner.accountEquityId, partner.accountSavingId, partner.accountNewCapitalId] } } },
                },
                select: { id: true },
            });

            if (headersToDelete.length) {
                await tx.journalLine.deleteMany({
                    where: {
                        journalId: { in: headersToDelete.map(h => h.id) }
                    }
                });
            }

            if (headersToDelete.length) {
                await tx.journalHeader.deleteMany({
                    where: { id: { in: headersToDelete.map(h => h.id) } },
                });
            }

            await tx.loanNewCapitalShare.deleteMany({ where: { partnerId: id } });
            await tx.partnerNewCapital.deleteMany({ where: { partnerId: id } });
            await tx.zakatAccrual.deleteMany({ where: { partnerId: id } });
            await tx.zakatPayment.deleteMany({ where: { partnerId: id } });
            await tx.partnerTransaction.deleteMany({ where: { partnerId: id } });
            await tx.partnerShareAccrual.deleteMany({ where: { partnerId: id } });
            await tx.partnerSavingAccrual.deleteMany({ where: { partnerId: id } });
            await tx.partnerPeriodProfit.deleteMany({ where: { partnerId: id } });
            await tx.loanPartnerShare.deleteMany({ where: { partnerId: id } });
            await tx.partnerWithdrawalSchedule.deleteMany({ where: { partnerId: id } });
            await tx.partnerWithdrawal.deleteMany({ where: { partnerId: id } });
            await tx.partnerCount.deleteMany({ where: { partnerId: id } });
            await tx.partner.delete({ where: { id } });
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountEquityId } })
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountPayableId } })
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountSavingId } })
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountNewCapitalId } })
            await tx.account.delete({ where: { id: partner.accountPayableId } });
            await tx.account.delete({ where: { id: partner.accountEquityId } });
            await tx.account.delete({ where: { id: partner.accountSavingId } });
            await tx.account.delete({ where: { id: partner.accountNewCapitalId } });
        });

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'DELETE',
                description: `قام المستخدم ${user?.name} بحذف الشريك: ${partner.name}`,
            },
        });

        return { message: 'تم حذف المساهم بنجاح' };
    }

    async getAllPartners(page = 1, filters?: { limit?: number; name?: string; nationalId?: string; status?: 'ACTIVE' | 'INACTIVE' | 'FROZEN'; withdrawingStatus?: string; isNewPartner?: string; }) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.nationalId) where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };


        if (filters?.isNewPartner !== undefined) {
            where.isNewPartner = filters.isNewPartner === 'true';
        }


        if (filters?.status && !filters?.isNewPartner) {
            switch (filters.status) {
                case 'ACTIVE':
                    where.isNewPartner = false;
                    where.isFrozen = false;
                    break;

                case 'INACTIVE':
                    where.isNewPartner = true;
                    where.isFrozen = false;
                    break;

                case 'FROZEN':
                    where.isActive = false;
                    where.isFrozen = true;
                    break;
            }
        }


        if (filters?.withdrawingStatus) {
            const withdrawingStatuses = filters.withdrawingStatus.split(',');
            where.WithdrawingStatus = { in: withdrawingStatuses };
        }
        const totalPartners = await this.prisma.partner.count({ where });
        const totalPages = Math.ceil(totalPartners / limit);

        if (page > totalPages && totalPartners > 0) throw new NotFoundException('Page not found');


        const totalActiveCapital = await this.prisma.partner.aggregate({
            _sum: { totalAmount: true },
            where: { isNewPartner: false, joinDistribute: true },
        });

        const allNewCapital = await this.prisma.partnerNewCapital.aggregate({
            _sum: { remaining: true },
        });

        const totalNewCapital = allNewCapital._sum.remaining || 0;

        const partners = await this.prisma.partner.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                bankAccount: true,
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
                PartnerNewCapital: true,
            },
        });
        const totalGeneralCapital = totalActiveCapital._sum.totalAmount || 0;

        const enrichedPartners = await Promise.all(partners.map(async (p) => {
            const newCapital = p.PartnerNewCapital?.reduce(
                (sum, nc) => sum + nc.remaining,
                0
            ) || 0;

            const generalPercent =
                totalGeneralCapital > 0
                    ? (p.joinDistribute
                        ? Number(((p.totalAmount / totalGeneralCapital) * 100).toFixed(2))
                        : 0)
                    : 0;

            const newCapitalPercent =
                totalNewCapital > 0
                    ? (p.joinDistribute
                        ? Number(((newCapital / totalNewCapital) * 100).toFixed(2))
                        : 0)
                    : 0;


            const upcomingProfitData = await this.calculatePartnerUpcomingProfit(p.id);

            return {
                ...p,
                generalCapital: p.totalAmount,
                generalProfitPercent: generalPercent,

                newCapitalAmount: newCapital,
                newCapitalPercent,

                zakat: p.yearlyZakatBalance,
                total: newCapital + p.totalAmount,

                totalSaving: p.AccountSaving.credit,
                totalAvilableSaving: p.AccountSaving.balance,
                totalWithdrawal: p.AccountSaving.debit,

                upcomingProfit: upcomingProfitData.upcomingProfit,
            };
        }));

        return {
            totalPartners,
            totalPages,
            currentPage: page,
            partners: enrichedPartners,
        };
    }

    async getPartnerById(id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                bankAccount: true,
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
                PartnerNewCapital: true,
                loans: true,
                transactions: true,
                PartnerWithdrawal: true,
                PartnerWithdrawalSchedule: {
                    where: { voucherUrl: { not: null } },
                    select: {
                        id: true,
                        month: true,
                        year: true,
                        amount: true,
                        carryAmount: true,
                        paidAmount: true,
                        voucherUrl: true,
                        paidAt: true,
                    },
                    orderBy: [{ year: 'desc' }, { month: 'desc' }],
                },
            },
        });

        if (!partner) throw new NotFoundException('Partner not found');

        const newCapitalAmount =
            partner.PartnerNewCapital?.reduce(
                (sum, nc) => sum + nc.remaining,
                0
            ) || 0;


        const toHijri = (date: Date | null) => {
            if (!date) return null;
            return moment(date).locale('ar-SA').format('iDD iMMMM iYYYY');
        };


        const toSaudi = (date: Date | null) => {
            if (!date) return null;
            return DateTime.fromJSDate(date)
                .setZone("Asia/Riyadh")
                .toFormat("yyyy-LL-dd HH:mm:ss");
        };

        const generalPartners = await this.prisma.partner.findMany({
            where: { isNewPartner: false, isFrozen: false, joinDistribute: true },
            select: { totalAmount: true },
        });

        const totalGeneralCapital = generalPartners.reduce(
            (sum, p) => sum + p.totalAmount,
            0
        );

        const generalProfitPercent =
            totalGeneralCapital > 0 && partner.isFrozen === false && partner.joinDistribute === true
                ? Number(((partner.totalAmount / totalGeneralCapital) * 100).toFixed(2))
                : 0;

        const allNewCapital = await this.prisma.partnerNewCapital.aggregate({
            _sum: { remaining: true },
        });

        const totalNewCapital = allNewCapital._sum.remaining || 0;

        const newCapitalPercent =
            totalNewCapital > 0 && partner.joinDistribute === true
                ? Number(((newCapitalAmount / totalNewCapital) * 100).toFixed(2))
                : 0;

        const calculateDuration = (from: Date) => {
            const start = DateTime.fromJSDate(from, { zone: 'utc' });
            const now = DateTime.utc();

            const diff = now.diff(start, ['years', 'months', 'days']).toObject();

            return {
                years: Math.floor(diff.years || 0),
                months: Math.floor(diff.months || 0),
                days: Math.floor(diff.days || 0),
                totalDays: Math.floor(now.diff(start, 'days').days),
            };
        };

        const duration = calculateDuration(partner.createdAt);


        const upcomingProfitData = await this.calculatePartnerUpcomingProfit(partner.id);

        const withdrawalVouchers = partner.PartnerWithdrawalSchedule?.map(schedule => ({
            id: schedule.id,
            month: schedule.month,
            year: schedule.year,
            amount: schedule.amount,
            carryAmount: schedule.carryAmount || 0,
            paidAmount: schedule.paidAmount || 0,
            totalAmount: (schedule.amount || 0) + (schedule.carryAmount || 0),
            voucherUrl: schedule.voucherUrl,
            paidAt: schedule.paidAt ? toSaudi(schedule.paidAt) : null,
        })) || [];

        return {
            ...partner,
            createdAt: toSaudi(partner.createdAt),
            contractSignedAt: toSaudi(partner.contractSignedAt),
            partnerProfitPercent: generalProfitPercent,
            newCapitalAmount,
            newCapitalPercent,
            zakat: partner.yearlyZakatBalance,
            total: newCapitalAmount + partner.totalAmount,
            totalAmount: newCapitalAmount + partner.capitalAmount,
            totalSaving: partner.AccountSaving?.credit ?? 0,
            totalAvilableSaving: partner.AccountSaving?.balance ?? 0,
            totalWithdrawal: partner.AccountSaving?.debit ?? 0,
            duration,
            withdrawalReceipt: partner.PartnerWithdrawal?.[0]?.WITHDRAWAL_RECEIPT || null,
            withdrawalVouchers,
            HIjriCreatedAt: toHijri(partner.createdAt),
            HIjriContractSignedAt: toHijri(partner.contractSignedAt),
            upcomingProfit: upcomingProfitData.upcomingProfit,
        };
    }

    async uploadMudarabahFile(currentUser, id: number, file: Express.Multer.File) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner) throw new NotFoundException('Partner not found');

        if (!file) throw new BadRequestException('No file uploaded');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        if (partner.mudarabahFileUrl) {
            try {
                let existingRelative = partner.mudarabahFileUrl;
                if (existingRelative.startsWith('http')) {
                    existingRelative = decodeURI(existingRelative.replace(process.env.URL || '', ''));
                }
                const existingFull = path.join(process.cwd(), existingRelative);
                if (fs.existsSync(existingFull)) fs.unlinkSync(existingFull);
            } catch (err) {
                console.warn('Could not remove old mudarabah file:', err);
            }
        }


        const ext = path.extname(file.originalname);
        const fileName = `MUDARABAH_${id}_${Date.now()}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);


        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${relPath}`;


        await this.prisma.partner.update({
            where: { id },
            data: { mudarabahFileUrl: publicUrl },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ملف المضاربة للشريك: ${partner.name}`,
            },
        });

        return { message: 'تم رفع المستند بنجاح', path: publicUrl };
    }

    private async generateNextCode(prefix: string): Promise<string> {
        const latest = await this.prisma.account.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
        });

        const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}0000`;
        return nextCode;
    }

    private async calculatePartnerUpcomingProfit(partnerId: number): Promise<{
        upcomingProfit: number;
        upcomingCents: number;
        totalUpcoming: number;
    }> {
        const pendingAccruals = await this.prisma.partnerShareAccrual.findMany({
            where: {
                partnerId,
                isDistributed: false,
            },
            include: { period: true },
            orderBy: { periodId: 'asc' },
        });

        if (!pendingAccruals.length) return { upcomingProfit: 0, upcomingCents: 0, totalUpcoming: 0 };

        let upcomingProfit = 0;
        let upcomingCents = 0;


        const accrualsByPeriod: Record<number, typeof pendingAccruals> = {};
        for (const a of pendingAccruals) {
            if (!a.periodId) continue;
            if (!accrualsByPeriod[a.periodId]) accrualsByPeriod[a.periodId] = [];
            accrualsByPeriod[a.periodId].push(a);
        }

        for (const periodIdStr in accrualsByPeriod) {
            const periodId = Number(periodIdStr);
            const periodAccruals = accrualsByPeriod[periodId];


            const allPeriodAccruals = await this.prisma.partnerShareAccrual.findMany({
                where: {
                    periodId,
                    isDistributed: false
                },
            });

            let totalGrossPartner = 0;
            let totalGrossCompany = 0;
            let totalOldCents = 0;

            for (const a of allPeriodAccruals) {
                totalGrossPartner += Number(a.partnerFinal || 0);
                totalGrossCompany += Number(a.companyCut || 0);
                totalOldCents += Number(a.cents || 0);
            }

            const totalGross = totalGrossPartner + totalGrossCompany + totalOldCents;


            const expensesAgg = await this.prisma.journalLine.aggregate({
                where: {
                    journal: { periodId },
                    account: { accountBasicType: 'EXPENSES' }
                },
                _sum: { debit: true }
            });
            const totalExpenses = Number(expensesAgg._sum.debit || 0);


            const partnersExpenseShare = totalGross > 0
                ? totalExpenses * (totalGrossPartner / totalGross)
                : 0;

            const partnerGross = periodAccruals.reduce((sum, a) => sum + Number(a.partnerFinal || 0), 0);

            const partnerExpenseShare = totalGrossPartner > 0
                ? partnersExpenseShare * (partnerGross / totalGrossPartner)
                : 0;

            const partnerNet = partnerGross - partnerExpenseShare;

            const profitWhole = Math.floor(partnerNet);
            const profitCents = Number((partnerNet - profitWhole).toFixed(2));

            upcomingProfit += profitWhole;
            upcomingCents += profitCents;
        }

        const totalUpcoming = Number((upcomingProfit + upcomingCents).toFixed(2));

        return {
            upcomingProfit: Number(upcomingProfit.toFixed(2)),
            upcomingCents: Number(upcomingCents.toFixed(2)),
            totalUpcoming
        };
    }
}