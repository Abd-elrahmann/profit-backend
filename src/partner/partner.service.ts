import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import * as fs from 'fs';
import * as path from 'path';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType, JournalStatus, JournalType } from '@prisma/client';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class PartnerService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // CREATE PARTNER
    async createPartner(currentUser, dto: CreatePartnerDto) {
        const existing = await this.prisma.partner.findFirst({
            where: { nationalId: dto.nationalId },
        });
        if (existing) throw new BadRequestException('المساهم برقم الهوية هذا موجود مسبقًا');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const liabilities = await this.prisma.account.findUnique({ where: { code: '20000' } });
        const equity = await this.prisma.account.findUnique({ where: { code: '30000' } });
        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });

        if (!liabilities || !equity || !bank) {
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

        const partner = await this.prisma.partner.create({
            data: {
                name: dto.name,
                nationalId: dto.nationalId,
                address: dto.address,
                phone: dto.phone,
                email: dto.email,
                orgProfitPercent: dto.orgProfitPercent,
                capitalAmount: dto.capitalAmount,
                totalAmount: dto.capitalAmount,
                contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null,
                mudarabahFileUrl: dto.mudarabahFileUrl,
                isActive: dto.isActive ?? false,
                accountPayableId: payableAccount.id,
                accountEquityId: equityAccount.id,
                accountSavingId: savingAccount.id,
                yearlyZakatRequired: dto.capitalAmount * 0.025,
                yearlyZakatPaid: 0,
                yearlyZakatBalance: 0,
            },
            include: {
                AccountPayable: true,
                AccountEquity: true,
            },
        });

        const journalDto = {
            reference: `CAP-${partner.id}`,
            description: `إيداع رأس مال الشريك ${partner.name}`,
            type: JournalType.OPENING,
            sourceType: JournalSourceType.PARTNER,
            sourceId: partner.id,
            lines: [
                {
                    accountId: bank.id,
                    debit: dto.capitalAmount,
                    credit: 0,
                    description: 'إيداع نقدي لرأس المال',
                },
                {
                    accountId: equityAccount.id,
                    debit: 0,
                    credit: dto.capitalAmount,
                    description: `رأس مال ${partner.name}`,
                },
            ],
        };

        await this.journalService.createJournal(journalDto, currentUser);

        const startMonth = partner.createdAt ? new Date(partner.createdAt).getMonth() + 1 : new Date().getMonth() + 1;
        const remainingMonths = 12 - startMonth + 1;

        // حساب الزكاة السنوية والقسط الشهري
        const annualZakat = partner.capitalAmount * 0.025;
        const monthlyZakat = annualZakat / remainingMonths;
        const currentYear = new Date().getFullYear();

        for (let month = startMonth; month <= 12; month++) {
            await this.prisma.zakatAccrual.create({
                data: {
                    partnerId: partner.id,
                    year: currentYear,
                    month: month,
                    amount: monthlyZakat,
                },
            });
        }

        // create audit log
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

    // UPDATE PARTNER
    async updatePartner(currentUser, id: number, dto: UpdatePartnerDto) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner) throw new NotFoundException('Partner not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const updated = await this.prisma.partner.update({
            where: { id },
            data: {
                ...dto,
                contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : partner.contractSignedAt,
            },
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث بيانات الشريك: ${partner.name}`,
            },
        });

        return { message: 'تم تحديث بيانات المساهم بنجاح', partner: updated };
    }

    // DELETE PARTNER
    async deletePartner(currentUser, id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: { AccountPayable: true, AccountEquity: true },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        // Remove partner upload directory (if exists)
        try {
            const partnerDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId);
            if (fs.existsSync(partnerDir)) {
                fs.rmSync(partnerDir, { recursive: true, force: true });
            }
        } catch (err) {
            console.warn('Could not remove partner upload directory:', err.message);
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountPayableId } });
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountEquityId } });
            await tx.journalHeader.deleteMany({
                where: {
                    lines: { some: { accountId: { in: [partner.accountPayableId, partner.accountEquityId] } } },
                },
            });
            await tx.zakatAccrual.deleteMany({ where: { partnerId: id } });
            await tx.zakatPayment.deleteMany({ where: { partnerId: id } });
            await tx.partnerTransaction.deleteMany({ where: { partnerId: id } });
            await tx.partnerShareAccrual.deleteMany({ where: { partnerId: id } });
            await tx.partnerPeriodProfit.deleteMany({ where: { partnerId: id } });
            await tx.loanPartnerShare.deleteMany({ where: { partnerId: id } })
            await tx.partner.delete({ where: { id } });
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountEquityId } })
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountPayableId } })
            await tx.account.delete({ where: { id: partner.accountPayableId } });
            await tx.account.delete({ where: { id: partner.accountEquityId } });
        });

        // create audit log
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

    // GET ALL PARTNERS (with pagination + filters)
    async getAllPartners(page = 1, filters?: { limit?: number; name?: string; nationalId?: string; isActive?: boolean }) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.nationalId) where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.isActive !== undefined) where.isActive = filters.isActive;

        const totalPartners = await this.prisma.partner.count({ where });
        const totalPages = Math.ceil(totalPartners / limit);

        if (page > totalPages && totalPartners > 0) throw new NotFoundException('Page not found');

        // Total active capital for percent calculation
        const totalActiveCapital = await this.prisma.partner.aggregate({
            _sum: { totalAmount: true },
            where: { isActive: true },
        });

        const partners = await this.prisma.partner.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
            },
        });
        const totalCapital = totalActiveCapital._sum.totalAmount || 0;

        // Add partnerProfitPercent dynamically
        const enrichedPartners = partners.map(p => ({
            ...p,
            partnerProfitPercent: totalCapital > 0 ? Number(((p.totalAmount / totalCapital) * 100).toFixed(2)) : 0,
            totalSaving: p.AccountSaving.balance,
        }));

        return {
            totalPartners,
            totalPages,
            currentPage: page,
            partners: enrichedPartners,
        };
    }

    // GET SPECIFIC PARTNER
    async getPartnerById(id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
                loans: true,
                transactions: true,
            },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        const totalActiveCapital = await this.prisma.partner.aggregate({
            _sum: { totalAmount: true },
            where: { isActive: true },
        });

        const totalCapital = totalActiveCapital._sum.totalAmount || 0;
        const partnerProfitPercent = totalCapital > 0 ? Number(((partner.totalAmount / totalCapital) * 100).toFixed(2)) : 0;

        return {
            ...partner,
            partnerProfitPercent,
            totalSaving: partner.AccountSaving.balance,
        };
    }

    // UPLOAD MUDARABAH FILE
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
                console.warn('Could not remove old mudarabah file:', err.message);
            }
        }

        // Build file path on disk and write buffer
        const filePath = path.join(uploadDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);

        // Build public URL to store in DB
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        // Update database with public URL
        await this.prisma.partner.update({
            where: { id },
            data: { mudarabahFileUrl: publicUrl },
        });

        // create audit log
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

    // Helper: generate incremental account codes
    private async generateNextCode(prefix: string): Promise<string> {
        const latest = await this.prisma.account.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
        });

        const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}0000`;
        return nextCode;
    }

    // PARTNER TRANSACTIONS
    async createPartnerTransaction(
        currentUser: number,
        partnerId: number,
        dto: {
            type: 'DEPOSIT' | 'WITHDRAWAL' | 'PROFIT_WITHDRAWAL' | 'SAVING_WITHDRAWAL'
            ; amount: number; description?: string
        }
    ) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: { AccountEquity: true, AccountSaving: true },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        if (!partner.accountEquityId)
            throw new BadRequestException('Partner capital account not defined');

        if (dto.amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر.');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        if (dto.type === 'SAVING_WITHDRAWAL') {
            if (partner.AccountSaving.balance < dto.amount) {
                throw new BadRequestException('رصيد التوفير غير كافٍ للسحب.');
            }
        }

        if (dto.type === 'WITHDRAWAL') {
            const monthsSinceCreation = DateTime.now()
                .diff(DateTime.fromJSDate(partner.createdAt), 'months')
                .months;

            if (monthsSinceCreation < 15) {
                throw new BadRequestException('لا يمكن السحب من رأس المال قبل مرور 15 شهرًا على الإيداع.');
            }

            if (partner.capitalAmount < dto.amount) {
                throw new BadRequestException('رصيد رأس المال غير كافٍ للسحب.');
            }
        }

        if (dto.type === 'PROFIT_WITHDRAWAL') {
            if (partner.totalProfit < dto.amount) {
                throw new BadRequestException('رصيد الأرباح غير كافٍ للسحب.');
            }
        }

        const reference = `PT-${partnerId}-${Date.now()}`;

        const transaction = await this.prisma.partnerTransaction.create({
            data: {
                partnerId,
                type: dto.type,
                amount: dto.amount,
                description: dto.description,
                reference,
            },
        });

        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bank) throw new BadRequestException('Bank account (11000) must exist');

        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount) throw new BadRequestException('saving Account (20002) must exist');

        let journalLines;
        let journalDescription;

        if (dto.type === 'DEPOSIT') {
            journalLines = [
                {
                    accountId: bank.id,
                    debit: dto.amount,
                    credit: 0,
                    description: `إيداع نقدي من الشريك ${partner.name}`,
                },
                {
                    accountId: partner.accountEquityId,
                    debit: 0,
                    credit: dto.amount,
                    description: `زيادة في رأس مال الشريك ${partner.name}`,
                },
            ];
            journalDescription = `إيداع نقدي من الشريك ${partner.name}`;
        } else {
            journalLines = [
                {
                    accountId: partner.accountEquityId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من رأس مال الشريك ${partner.name}`,
                },
                {
                    accountId: bank.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `سحب نقدي للشريك ${partner.name}`,
                },
            ];
            journalDescription = `سحب نقدي من رأس مال الشريك ${partner.name}`;
        }

        if (dto.type === 'PROFIT_WITHDRAWAL') {
            journalLines = [
                {
                    accountId: partner.accountPayableId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من أرباح الشريك ${partner.name}`,
                },
                {
                    accountId: bank.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `صرف أرباح للشريك ${partner.name}`,
                },
            ];
            journalDescription = `سحب أرباح للشريك ${partner.name}`;
        }

        if (dto.type === 'SAVING_WITHDRAWAL') {
            journalLines = [
                {
                    accountId: partner.accountSavingId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من توفير الشريك ${partner.name}`,
                },
                {
                    accountId: savingAccount.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `صرف من توفير الشريك ${partner.name}`,
                },
            ];

            journalDescription = `سحب من التوفير للشريك ${partner.name}`;
        }

        const journalDto = {
            reference,
            description: journalDescription,
            type: JournalType.GENERAL,
            sourceType:
                dto.type === 'DEPOSIT'
                    ? JournalSourceType.PARTNER_TRANSACTION_DEPOSIT
                    : dto.type === 'WITHDRAWAL'
                        ? JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL
                        : dto.type === 'PROFIT_WITHDRAWAL'
                            ? JournalSourceType.PARTNER_PROFIT_WITHDRAWAL
                            : JournalSourceType.PARTNER_SAVING_WITHDRAWAL,

            lines: journalLines,
        };

        // Create Journal
        const journal = await this.journalService.createJournal(journalDto, currentUser);

        // Post the Journal
        await this.journalService.postJournal(journal.journal.id, currentUser);

        let newCapitalAmount = partner.capitalAmount;
        let newTotalAmount = partner.totalAmount;
        let newProfitAmount = partner.totalProfit;

        if (dto.type === 'DEPOSIT') {
            newCapitalAmount += dto.amount;
            newTotalAmount += dto.amount;

        } else if (dto.type === 'WITHDRAWAL') {
            newCapitalAmount -= dto.amount;
            newTotalAmount -= dto.amount;

        } else if (dto.type === 'PROFIT_WITHDRAWAL') {
            newProfitAmount -= dto.amount;
            newTotalAmount -= dto.amount;
        }

        await this.prisma.partner.update({
            where: { id: partnerId },
            data: {
                capitalAmount: newCapitalAmount,
                totalAmount: newTotalAmount,
                totalProfit: newProfitAmount
            },
        });

        await this.prisma.partnerTransaction.update({
            where: { id: transaction.id },
            data: { journalId: journal.journal.id },
        });

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء معاملة ${dto.type === 'DEPOSIT' ? 'إيداع' :
                        dto.type === 'WITHDRAWAL' ? 'سحب من رأس المال' :
                            dto.type === 'PROFIT_WITHDRAWAL' ? 'سحب من الأرباح' :
                                'سحب من التوفير'
                    } بقيمة ${dto.amount} للشريك ${partner.name} (تم إنشاء وترحيل القيد المحاسبي بنجاح)`,
            },
        });

        return {
            message: 'تم إنشاء معاملة المساهم بنجاح',
            transaction,
            journal,
        };
    }

    // DELETE PARTNER TRANSACTION
    async deletePartnerTransaction(currentUser: number, id: number) {
        const transaction = await this.prisma.partnerTransaction.findUnique({
            where: { id },
            include: { partner: true },
        });
        if (!transaction) throw new NotFoundException('Transaction not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // Find related journal by reference
        const journal = await this.prisma.journalHeader.findUnique({
            where: { reference: transaction.reference || '' },
            include: { lines: true },
        });

        if (journal) {
            if (journal.status === JournalStatus.POSTED) {
                await this.journalService.unpostJournal(currentUser, journal.id);
            }

            await this.journalService.deleteJournal(currentUser, journal.id);
        }

        // update partner capitalAmount
        const partner = await this.prisma.partner.findUnique({ where: { id: transaction.partnerId } });
        if (partner) {
            let newCapitalAmount = partner.capitalAmount;
            let newTotalAmount = partner.totalAmount;
            let newTotalProfit = partner.totalProfit;
            if (transaction.type === 'DEPOSIT') {
                newCapitalAmount -= transaction.amount;
                newTotalAmount -= transaction.amount;
            } else if (transaction.type === 'WITHDRAWAL') {
                newCapitalAmount += transaction.amount;
                newTotalAmount += transaction.amount;
            } else if (transaction.type === 'PROFIT_WITHDRAWAL') {
                newTotalProfit += transaction.amount;
                newTotalAmount += transaction.amount;
            }

            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    capitalAmount: newCapitalAmount,
                    totalAmount: newTotalAmount,
                    totalProfit: newTotalProfit
                },
            });

            // Delete the partner transaction
            await this.prisma.partnerTransaction.delete({ where: { id } });

            // Audit Log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Partners',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بحذف معاملة ${transaction.type === 'DEPOSIT' ? 'إيداع' : 'سحب'} بقيمة ${transaction.amount} للشريك ${transaction.partner.name}`,
                },
            });

            return { message: 'تم حذف معاملة المساهم بنجاح' };
        }
    }

    // GET PARTNER TRANSACTIONS
    async getPartnerTransactions(
        partnerId: number,
        page: number,
        filters?: {
            limit?: number;
            type?: 'DEPOSIT' | 'WITHDRAWAL';
            search?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = { partnerId };

        // Filter by type
        if (filters?.type) where.type = filters.type;

        // Search in description or reference
        if (filters?.search)
            where.OR = [
                { description: { contains: filters.search, mode: 'insensitive' } },
                { reference: { contains: filters.search, mode: 'insensitive' } },
            ];

        // Timezone-based date filtering (Asia/Riyadh)
        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                const startUtc = DateTime.fromISO(filters.startDate, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.gte = startUtc;
            }
            if (filters.endDate) {
                const endUtc = DateTime.fromISO(filters.endDate, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.lte = endUtc;
            }
        }

        // Count total
        const totalTransactions = await this.prisma.partnerTransaction.count({ where });
        const totalPages = Math.ceil(totalTransactions / limit);

        // Fetch transactions
        const transactions = await this.prisma.partnerTransaction.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { partner: { select: { name: true } } },
        });

        // Convert UTC → Riyadh time
        const convertedTransactions = transactions.map((t) => ({
            ...t,
            date: DateTime.fromJSDate(t.date, { zone: 'utc' })
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd HH:mm:ss'),
        }));

        return {
            totalTransactions,
            totalPages,
            currentPage: page,
            limit,
            transactions: convertedTransactions,
        };
    }
}