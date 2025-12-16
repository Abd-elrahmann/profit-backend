"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const journal_service_1 = require("../journal/journal.service");
const client_1 = require("@prisma/client");
const luxon_1 = require("luxon");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
let PartnerService = class PartnerService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    async createPartner(currentUser, dto) {
        const existing = await this.prisma.partner.findFirst({
            where: { nationalId: dto.nationalId },
        });
        if (existing)
            throw new common_1.BadRequestException('المساهم برقم الهوية هذا موجود مسبقًا');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const liabilities = await this.prisma.account.findUnique({ where: { code: '20000' } });
        const equity = await this.prisma.account.findUnique({ where: { code: '30000' } });
        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!liabilities || !equity || !bank) {
            throw new common_1.BadRequestException('Base accounts (11000, 20000, 30000) must exist first');
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
                createdAt: dto.createdAt ? new Date(dto.createdAt) : new Date(),
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
            type: client_1.JournalType.OPENING,
            sourceType: client_1.JournalSourceType.PARTNER,
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
    async updatePartner(currentUser, id, dto) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        if (dto.isActive === false) {
            dto.joinDistribute = false;
        }
        if (dto.isActive === true) {
            dto.joinDistribute = true;
        }
        const updated = await this.prisma.partner.update({
            where: { id },
            data: {
                ...dto,
                contractSignedAt: dto.contractSignedAt
                    ? new Date(dto.contractSignedAt)
                    : partner.contractSignedAt,
                createdAt: dto.createdAt
                    ? new Date(dto.createdAt)
                    : partner.createdAt,
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث بيانات الشريك: ${partner.name}`,
            },
        });
        return {
            message: 'تم تحديث بيانات المساهم بنجاح',
            partner: updated,
        };
    }
    async deletePartner(currentUser, id) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: { AccountPayable: true, AccountEquity: true },
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        try {
            const partnerDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId);
            if (fs.existsSync(partnerDir)) {
                fs.rmSync(partnerDir, { recursive: true, force: true });
            }
        }
        catch (err) {
            console.warn('Could not remove partner upload directory:', err.message);
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountPayableId } });
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountEquityId } });
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountSavingId } });
            await tx.journalHeader.deleteMany({
                where: {
                    lines: { some: { accountId: { in: [partner.accountPayableId, partner.accountEquityId, partner.accountSavingId] } } },
                },
            });
            await tx.zakatAccrual.deleteMany({ where: { partnerId: id } });
            await tx.zakatPayment.deleteMany({ where: { partnerId: id } });
            await tx.partnerTransaction.deleteMany({ where: { partnerId: id } });
            await tx.partnerShareAccrual.deleteMany({ where: { partnerId: id } });
            await tx.partnerPeriodProfit.deleteMany({ where: { partnerId: id } });
            await tx.loanPartnerShare.deleteMany({ where: { partnerId: id } });
            await tx.partnerWithdrawalSchedule.deleteMany({ where: { partnerId: id } });
            await tx.partnerWithdrawal.deleteMany({ where: { partnerId: id } });
            await tx.partner.delete({ where: { id } });
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountEquityId } });
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountPayableId } });
            await tx.accountsClosing.deleteMany({ where: { accountId: partner.accountSavingId } });
            await tx.account.delete({ where: { id: partner.accountPayableId } });
            await tx.account.delete({ where: { id: partner.accountEquityId } });
            await tx.account.delete({ where: { id: partner.accountSavingId } });
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
    async getAllPartners(page = 1, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.nationalId)
            where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.status) {
            switch (filters.status) {
                case 'ACTIVE':
                    where.isActive = true;
                    where.isFrozen = false;
                    break;
                case 'INACTIVE':
                    where.isActive = false;
                    where.isFrozen = false;
                    break;
                case 'FROZEN':
                    where.isActive = false;
                    where.isFrozen = true;
                    break;
            }
        }
        const totalPartners = await this.prisma.partner.count({ where });
        const totalPages = Math.ceil(totalPartners / limit);
        if (page > totalPages && totalPartners > 0)
            throw new common_1.NotFoundException('Page not found');
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
    async getPartnerById(id) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                AccountSaving: true,
                loans: true,
                transactions: true,
                PartnerWithdrawal: true,
            },
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const toSaudi = (date) => {
            if (!date)
                return null;
            return luxon_1.DateTime.fromJSDate(date)
                .setZone("Asia/Riyadh")
                .toFormat("yyyy-LL-dd HH:mm:ss");
        };
        let totalCapital = 0;
        let partnerProfitPercent = 0;
        if (partner.isActive) {
            const activePartners = await this.prisma.partner.findMany({
                where: { isActive: true },
                select: { totalAmount: true }
            });
            totalCapital = activePartners.reduce((sum, p) => sum + p.totalAmount, 0);
            partnerProfitPercent = totalCapital > 0
                ? Number(((partner.totalAmount / totalCapital) * 100).toFixed(2))
                : 0;
        }
        else if (!partner.isActive && partner.joinDistribute === true) {
            const inactiveJoined = await this.prisma.partner.findMany({
                where: {
                    isActive: false,
                    joinDistribute: true,
                },
                select: { totalAmount: true }
            });
            totalCapital = inactiveJoined.reduce((sum, p) => sum + p.totalAmount, 0);
            partnerProfitPercent = totalCapital > 0
                ? Number(((partner.totalAmount / totalCapital) * 100).toFixed(2))
                : 0;
        }
        else {
            totalCapital = 0;
            partnerProfitPercent = 0;
        }
        const calculateDuration = (from) => {
            const start = luxon_1.DateTime.fromJSDate(from, { zone: 'utc' });
            const now = luxon_1.DateTime.utc();
            const diff = now.diff(start, ['years', 'months', 'days']).toObject();
            return {
                years: Math.floor(diff.years || 0),
                months: Math.floor(diff.months || 0),
                days: Math.floor(diff.days || 0),
                totalDays: Math.floor(now.diff(start, 'days').days),
            };
        };
        const duration = calculateDuration(partner.createdAt);
        return {
            ...partner,
            createdAt: toSaudi(partner.createdAt),
            contractSignedAt: toSaudi(partner.contractSignedAt),
            partnerProfitPercent,
            totalSaving: partner.AccountSaving?.balance ?? 0,
            duration,
            withdrawalReceipt: partner.PartnerWithdrawal?.[0]?.WITHDRAWAL_RECEIPT || null,
        };
    }
    async uploadMudarabahFile(currentUser, id, file) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const uploadDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        if (partner.mudarabahFileUrl) {
            try {
                let existingRelative = partner.mudarabahFileUrl;
                if (existingRelative.startsWith('http')) {
                    existingRelative = decodeURI(existingRelative.replace(process.env.URL || '', ''));
                }
                const existingFull = path.join(process.cwd(), existingRelative);
                if (fs.existsSync(existingFull))
                    fs.unlinkSync(existingFull);
            }
            catch (err) {
                console.warn('Could not remove old mudarabah file:', err.message);
            }
        }
        const filePath = path.join(uploadDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
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
    async generateNextCode(prefix) {
        const latest = await this.prisma.account.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
        });
        const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}0000`;
        return nextCode;
    }
    async createPartnerTransaction(currentUser, partnerId, dto) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: { AccountEquity: true, AccountSaving: true },
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        if (!partner.accountEquityId)
            throw new common_1.BadRequestException('Partner capital account not defined');
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('المبلغ يجب أن يكون أكبر من صفر.');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        if (dto.type === 'SAVING_WITHDRAWAL') {
            if (partner.AccountSaving.balance < dto.amount) {
                throw new common_1.BadRequestException(`رصيد توفير الشريك غير كافٍ للسحب. الرصيد الحالي: ${partner.AccountSaving.balance}`);
            }
        }
        if (dto.type === 'WITHDRAWAL') {
            const monthsSinceCreation = luxon_1.DateTime.now()
                .diff(luxon_1.DateTime.fromJSDate(partner.createdAt), 'months')
                .months;
            if (monthsSinceCreation < 15) {
                throw new common_1.BadRequestException('لا يمكن السحب من رأس المال قبل مرور 15 شهرًا على الإيداع.');
            }
            if (partner.capitalAmount < dto.amount) {
                throw new common_1.BadRequestException('رصيد رأس المال غير كافٍ للسحب.');
            }
        }
        if (dto.type === 'PROFIT_WITHDRAWAL') {
            if (partner.totalProfit < dto.amount) {
                throw new common_1.BadRequestException('رصيد الأرباح غير كافٍ للسحب.');
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
        if (!bank)
            throw new common_1.BadRequestException('Bank account (11000) must exist');
        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount)
            throw new common_1.BadRequestException('saving Account (20002) must exist');
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
        }
        else {
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
            type: client_1.JournalType.GENERAL,
            sourceType: dto.type === 'DEPOSIT'
                ? client_1.JournalSourceType.PARTNER_TRANSACTION_DEPOSIT
                : dto.type === 'WITHDRAWAL'
                    ? client_1.JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL
                    : dto.type === 'PROFIT_WITHDRAWAL'
                        ? client_1.JournalSourceType.PARTNER_PROFIT_WITHDRAWAL
                        : client_1.JournalSourceType.PARTNER_SAVING_WITHDRAWAL,
            lines: journalLines,
        };
        const journal = await this.journalService.createJournal(journalDto, currentUser);
        await this.journalService.postJournal(journal.journal.id, currentUser);
        let newCapitalAmount = partner.capitalAmount;
        let newTotalAmount = partner.totalAmount;
        let newProfitAmount = partner.totalProfit;
        if (dto.type === 'DEPOSIT') {
            newCapitalAmount += dto.amount;
            newTotalAmount += dto.amount;
        }
        else if (dto.type === 'WITHDRAWAL') {
            newCapitalAmount -= dto.amount;
            newTotalAmount -= dto.amount;
        }
        else if (dto.type === 'PROFIT_WITHDRAWAL') {
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
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء معاملة ${dto.type === 'DEPOSIT' ? 'إيداع' :
                    dto.type === 'WITHDRAWAL' ? 'سحب من رأس المال' :
                        dto.type === 'PROFIT_WITHDRAWAL' ? 'سحب من الأرباح' :
                            'سحب من التوفير'} بقيمة ${dto.amount} للشريك ${partner.name} (تم إنشاء وترحيل القيد المحاسبي بنجاح)`,
            },
        });
        return {
            message: 'تم إنشاء معاملة المساهم بنجاح',
            transaction,
            journal,
        };
    }
    async deletePartnerTransaction(currentUser, id) {
        const transaction = await this.prisma.partnerTransaction.findUnique({
            where: { id },
            include: { partner: true },
        });
        if (!transaction)
            throw new common_1.NotFoundException('Transaction not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const journal = await this.prisma.journalHeader.findUnique({
            where: { reference: transaction.reference || '' },
            include: { lines: true },
        });
        if (journal) {
            if (journal.status === client_1.JournalStatus.POSTED) {
                await this.journalService.unpostJournal(currentUser, journal.id);
            }
            await this.journalService.deleteJournal(currentUser, journal.id);
        }
        const partner = await this.prisma.partner.findUnique({ where: { id: transaction.partnerId } });
        if (partner) {
            let newCapitalAmount = partner.capitalAmount;
            let newTotalAmount = partner.totalAmount;
            let newTotalProfit = partner.totalProfit;
            if (transaction.type === 'DEPOSIT') {
                newCapitalAmount -= transaction.amount;
                newTotalAmount -= transaction.amount;
            }
            else if (transaction.type === 'WITHDRAWAL') {
                newCapitalAmount += transaction.amount;
                newTotalAmount += transaction.amount;
            }
            else if (transaction.type === 'PROFIT_WITHDRAWAL') {
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
            await this.prisma.partnerTransaction.delete({ where: { id } });
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
    async getPartnerTransactions(partnerId, page, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = { partnerId };
        if (filters?.type)
            where.type = filters.type;
        if (filters?.search)
            where.OR = [
                { description: { contains: filters.search, mode: 'insensitive' } },
                { reference: { contains: filters.search, mode: 'insensitive' } },
            ];
        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                const startUtc = luxon_1.DateTime.fromISO(filters.startDate, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.gte = startUtc;
            }
            if (filters.endDate) {
                const endUtc = luxon_1.DateTime.fromISO(filters.endDate, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.lte = endUtc;
            }
        }
        const totalTransactions = await this.prisma.partnerTransaction.count({ where });
        const totalPages = Math.ceil(totalTransactions / limit);
        const transactions = await this.prisma.partnerTransaction.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { partner: { select: { name: true } } },
        });
        const convertedTransactions = transactions.map((t) => ({
            ...t,
            date: luxon_1.DateTime.fromJSDate(t.date, { zone: 'utc' })
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
};
exports.PartnerService = PartnerService;
exports.PartnerService = PartnerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], PartnerService);
//# sourceMappingURL=partner.service.js.map