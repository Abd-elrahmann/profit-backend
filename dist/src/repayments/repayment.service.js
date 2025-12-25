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
exports.RepaymentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const journal_service_1 = require("../journal/journal.service");
const notification_service_1 = require("../notification/notification.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
let RepaymentService = class RepaymentService {
    prisma;
    journalService;
    notificationService;
    constructor(prisma, journalService, notificationService) {
        this.prisma = prisma;
        this.journalService = journalService;
        this.notificationService = notificationService;
    }
    async updateClientStatus(clientId) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId },
            include: { repayments: true },
        });
        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' },
            });
            return;
        }
        const allRepayments = loans.flatMap(l => l.repayments);
        const overdue = allRepayments.filter(r => r.status === 'OVERDUE' || (r.status !== 'PAID' && r.dueDate < new Date()));
        const unpaid = allRepayments.filter(r => r.status !== 'PAID');
        let newStatus = 'نشط';
        if (overdue.length > 0) {
            newStatus = 'متعثر';
        }
        else if (unpaid.length === 0) {
            newStatus = 'منتهي';
        }
        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }
    async getRepaymentById(id) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: {
                loan: {
                    include: {
                        client: true,
                    }
                },
                profitAccruals: {
                    select: {
                        partnerId: true,
                        rawShare: true,
                        companyCut: true,
                        partnerFinal: true,
                        isClosed: true,
                    }
                },
            }
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        return repayment;
    }
    async uploadReceipts(currentUser, id, files) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        if (!files || files.length === 0)
            throw new common_1.BadRequestException('No files uploaded');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const uploadsDir = path.join(process.cwd(), 'uploads', 'clients', repayment.client?.nationalId || 'unknown', 'repayments');
        if (!fs.existsSync(uploadsDir))
            fs.mkdirSync(uploadsDir, { recursive: true });
        if (Array.isArray(repayment.attachments)) {
            for (const fileUrl of repayment.attachments) {
                try {
                    const urlPath = new URL(fileUrl).pathname;
                    const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                    if (fs.existsSync(prevLocal))
                        fs.unlinkSync(prevLocal);
                }
                catch { }
            }
        }
        else if (typeof repayment.attachments === 'string') {
            try {
                const urlPath = new URL(repayment.attachments).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal))
                    fs.unlinkSync(prevLocal);
            }
            catch { }
        }
        const fileUrls = [];
        for (const file of files) {
            const filename = `${id}-${file.originalname}`;
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, file.buffer);
            const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
            const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
            fileUrls.push(publicUrl);
        }
        await this.prisma.repayment.update({
            where: { id },
            data: {
                attachments: fileUrls,
                status: client_1.PaymentStatus.PENDING_REVIEW,
                reviewStatus: 'PENDING',
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ايصالات للسداد للدفعة رقم ${id}`,
            },
        });
        return { message: 'تم رفع الايصال بنجاح', fileUrls };
    }
    async approveRepayment(currentUser, id, dto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        const loan = repayment.loan;
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status === client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('السلفة قيد الانتظار');
        if (repayment.status === client_1.PaymentStatus.PAID)
            throw new common_1.BadRequestException('الدفعة مدفوعة بالفعل');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const roundToTwo = (num) => Math.round(num * 100) / 100;
        const totalAmount = roundToTwo(dto.paidAmount ?? repayment.amount);
        const interestAmount = roundToTwo(repayment.interestAmount);
        const principalAmount = roundToTwo(repayment.principalAmount);
        const loansReceivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const loanIncome = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOAN_INCOME' },
        });
        if (!loansReceivable || !loanIncome)
            throw new common_1.BadRequestException('Missing required accounts setup');
        let creditAccount;
        if (loan.source === client_1.LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
        }
        else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
        }
        return await this.prisma.$transaction(async (tx) => {
            const journal = await this.journalService.createJournal({
                reference: `REP-${repayment.id}`,
                description: `الموافقة على سداد دفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                type: 'GENERAL',
                sourceType: client_1.JournalSourceType.REPAYMENT,
                sourceId: repayment.id,
                lines: [
                    {
                        accountId: creditAccount.id,
                        debit: totalAmount,
                        credit: 0,
                        description: `استلام سداد دفعة للسلفة رقم ${loan.id}`,
                    },
                    {
                        accountId: loansReceivable.id,
                        debit: 0,
                        credit: principalAmount,
                        description: 'سداد اصل السلفة',
                        clientId: loan.client.id,
                    },
                    {
                        accountId: loanIncome.id,
                        debit: 0,
                        credit: interestAmount,
                        description: 'دخل فوائد السلفة',
                        clientId: loan.client.id,
                    },
                ],
            }, currentUser);
            const updatedRepayment = await tx.repayment.update({
                where: { id },
                data: {
                    paidAmount: totalAmount,
                    status: client_1.PaymentStatus.PAID,
                    paymentDate: new Date(),
                    notes: dto.notes,
                    reviewStatus: 'APPROVED',
                    remaining: 0,
                },
            });
            let partnerShares = [];
            if (loan.source === client_1.LoanFundSource.GENERAL) {
                partnerShares = await tx.loanPartnerShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
                partnerShares = await tx.loanNewCapitalShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new common_1.BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;
            const totalInterest = interestAmount;
            const totalRepayments = await tx.repayment.count({
                where: { loanId: loan.id },
            });
            let repaymentIndex = await tx.repayment.count({
                where: { loanId: loan.id, id: { lt: repayment.id } },
            });
            for (const ps of partnerShares) {
                const sharePercent = loan.source === client_1.LoanFundSource.GENERAL
                    ? Number(ps.sharePercent || 0)
                    : Number(ps.percent || 0);
                const orgCutPercent = Number(ps.partner.orgProfitPercent || 0);
                const totalRawShareFinal = Number(((loan.interestAmount * sharePercent) / 100).toFixed(2));
                const totalCompanyCutFinal = Number(((totalRawShareFinal * orgCutPercent) / 100).toFixed(2));
                let rawShare = Number(((interestAmount * sharePercent) / 100).toFixed(2));
                let companyCut = Number(((rawShare * orgCutPercent) / 100).toFixed(2));
                let partnerFinal = rawShare - companyCut;
                const isLastRepayment = repaymentIndex + 1 === totalRepayments;
                if (isLastRepayment) {
                    const prev = await tx.partnerShareAccrual.aggregate({
                        where: {
                            loanId: loan.id,
                            partnerId: ps.partnerId,
                        },
                        _sum: { rawShare: true, companyCut: true },
                    });
                    const prevRaw = prev._sum.rawShare || 0;
                    const prevCut = prev._sum.companyCut || 0;
                    rawShare = Number((totalRawShareFinal - prevRaw).toFixed(2));
                    companyCut = Number((totalCompanyCutFinal - prevCut).toFixed(2));
                    partnerFinal = Number((rawShare - companyCut).toFixed(2));
                }
                await tx.partnerShareAccrual.create({
                    data: {
                        periodId,
                        loanId: loan.id,
                        repaymentId: repayment.id,
                        partnerId: ps.partnerId,
                        rawShare,
                        companyCut,
                        partnerFinal,
                    },
                });
            }
            const remaining = await tx.repayment.count({
                where: { loanId: loan.id, status: { not: client_1.PaymentStatus.PAID } },
            });
            if (remaining === 0) {
                const totalPaidAmount = await tx.repayment.aggregate({
                    where: { loanId: loan.id },
                    _sum: { paidAmount: true },
                }).then(res => res._sum.paidAmount || 0);
                await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                        status: 'COMPLETED',
                        endDate: new Date(),
                        newAmount: totalPaidAmount
                    },
                });
            }
            try {
                await this.notificationService.sendNotification({
                    templateType: client_1.TemplateType.PAYMENT_APPROVED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'WHATSAPP',
                });
            }
            catch (error) {
                console.error('❌ Failed to send WhatsApp notification:', error.message);
            }
            try {
                await this.notificationService.sendNotification({
                    templateType: client_1.TemplateType.PAYMENT_APPROVED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'TELEGRAM',
                });
            }
            catch (error) {
                console.error('❌ Failed to send Telegram notification:', error.message);
            }
            await this.updateClientStatus(loan.clientId);
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بالموافقة على السداد للدفعة رقم ${id}`,
                },
            });
            return {
                message: 'تم الموافقة على السداد بنجاح',
                repaymentId: id,
                journalId: journal.journal.id,
            };
        }, { timeout: 20000 });
    }
    async rejectRepayment(currentUser, id, dto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        const loan = repayment.loan;
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status === client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('السلفة قيد الانتظار');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        return await this.prisma.$transaction(async (tx) => {
            const journal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: client_1.JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                },
                include: { lines: true },
            });
            if (journal) {
                await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
                await tx.journalHeader.delete({ where: { id: journal.id } });
            }
            const updatedRepayment = await tx.repayment.update({
                where: { id },
                data: {
                    status: client_1.PaymentStatus.PENDING,
                    remaining: repayment.amount,
                    paidAmount: 0,
                    paymentDate: null,
                    reviewStatus: 'REJECTED',
                    notes: dto.notes,
                    attachments: [],
                    PaymentProof: null,
                },
            });
            await tx.partnerShareAccrual.deleteMany({
                where: { repaymentId: repayment.id },
            });
            try {
                await this.notificationService.sendNotification({
                    templateType: client_1.TemplateType.PAYMENT_REJECTED,
                    clientId: repayment.loan.clientId,
                    loanId: repayment.loan.id,
                    repaymentId: repayment.id,
                    channel: 'WHATSAPP',
                });
            }
            catch (error) {
                console.error('❌ Failed to send WhatsApp notification:', error.message);
            }
            try {
                await this.notificationService.sendNotification({
                    templateType: client_1.TemplateType.PAYMENT_REJECTED,
                    clientId: repayment.loan.clientId,
                    loanId: repayment.loan.id,
                    repaymentId: repayment.id,
                    channel: 'TELEGRAM',
                });
            }
            catch (error) {
                console.error('❌ Failed to send Telegram notification:', error.message);
            }
            await this.updateClientStatus(loan.clientId);
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} برفض السداد للدفعة رقم ${id}`,
                },
            });
            return { message: 'تم رفض سداد الدفعة بنجاح', repaymentId: id };
        }, { timeout: 20000 });
    }
    async postponeRepayment(currentUser, id, dto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        const loan = repayment.loan;
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status === client_1.LoanStatus.PENDING || client_1.LoanStatus.COMPLETED)
            throw new common_1.BadRequestException('السلفة غير نشطة');
        if (!dto.newDueDate)
            throw new common_1.BadRequestException('يجب تحديد تاريخ استحقاق جديد');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.repayment.update({
            where: { id },
            data: {
                postponeApproved: true,
                postponeReason: dto.postponeReason ?? 'Delay approved by management',
                newDueDate: new Date(dto.newDueDate),
                dueDate: new Date(dto.newDueDate),
                status: client_1.PaymentStatus.PENDING,
                reviewStatus: 'POSTPONED',
            },
        });
        await this.updateClientStatus(loan.clientId);
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتأجيل السداد للدفعة رقم ${id}`,
            },
        });
        return { message: 'تم تأجيل سداد الدفعة بنجاح', repaymentId: id };
    }
    async uploadPaymentProof(currentUser, id, file) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const nationalId = repayment.client?.nationalId;
        if (!nationalId)
            throw new common_1.BadRequestException('Client national ID not found');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', nationalId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        const filename = `${id}-اثبات-السداد${path.extname(file.originalname)}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);
        const prevFileUrl = typeof repayment.PaymentProof === 'string' ? repayment.PaymentProof : undefined;
        if (prevFileUrl) {
            try {
                const urlPath = new URL(prevFileUrl).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal))
                    fs.unlinkSync(prevLocal);
            }
            catch {
            }
        }
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        await this.prisma.repayment.update({
            where: { id },
            data: { PaymentProof: publicUrl }
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل اثبات السداد للدفعة رقم ${id}`,
            },
        });
        return { message: 'تم رفع مستند اثبات السداد بنجاح', fileUrl: publicUrl };
    }
    async markAsPartialPaid(currentUser, id, paidAmount) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment)
            throw new common_1.NotFoundException('Repayment not found');
        const loan = repayment.loan;
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status === client_1.LoanStatus.PENDING || loan.status === client_1.LoanStatus.COMPLETED)
            throw new common_1.BadRequestException('السلفة غير نشطة');
        if (paidAmount <= 0)
            throw new common_1.BadRequestException('المبلغ المدفوع يجب أن يكون أكبر من صفر');
        const currentPaid = repayment.paidAmount || 0;
        const newPaidAmount = currentPaid + paidAmount;
        if (newPaidAmount > repayment.amount)
            throw new common_1.BadRequestException(`المبلغ المدفوع يتجاوز مبلغ الدفعة. الحد الأقصى المسموح به: ${repayment.amount - currentPaid}`);
        const remaining = parseFloat((repayment.amount - newPaidAmount).toFixed(2));
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });
        if (!loansReceivable || !loanIncome)
            throw new common_1.BadRequestException('Missing required accounting accounts');
        let creditAccount;
        if (loan.source === client_1.LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
        }
        else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
        }
        return await this.prisma.$transaction(async (tx) => {
            const totalPrincipal = repayment.principalAmount;
            const totalInterest = repayment.amount - repayment.principalAmount;
            const alreadyPaidInterest = Math.max(currentPaid - totalPrincipal, 0);
            const remainingInterest = totalInterest - alreadyPaidInterest;
            let principalPart = 0;
            let interestPart = 0;
            if (currentPaid < totalPrincipal) {
                const remainingPrincipal = totalPrincipal - currentPaid;
                if (paidAmount <= remainingPrincipal) {
                    principalPart = paidAmount;
                }
                else {
                    principalPart = remainingPrincipal;
                    interestPart = paidAmount - remainingPrincipal;
                }
            }
            else {
                interestPart = paidAmount;
            }
            const roundToTwo = (num) => Math.round(num * 100) / 100;
            paidAmount = roundToTwo(paidAmount);
            principalPart = roundToTwo(principalPart);
            interestPart = roundToTwo(interestPart);
            await this.journalService.createJournal({
                reference: `PARTIAL-${repayment.id}-${Date.now()}`,
                description: `سداد جزئي للدفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                type: 'GENERAL',
                sourceType: client_1.JournalSourceType.REPAYMENT,
                sourceId: repayment.id,
                lines: [
                    {
                        accountId: creditAccount.id,
                        debit: paidAmount,
                        credit: 0,
                        description: `استلام سداد جزئي للدفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                    },
                    {
                        accountId: loansReceivable.id,
                        debit: 0,
                        credit: principalPart,
                        description: 'سداد جزء من اصل السلفة',
                        clientId: loan.client.id,
                    },
                    {
                        accountId: loanIncome.id,
                        debit: 0,
                        credit: interestPart,
                        description: 'سداد جزء من دخل فوائد السلفة',
                        clientId: loan.client.id,
                    },
                ],
            }, currentUser);
            const updated = await tx.repayment.update({
                where: { id },
                data: {
                    paidAmount: newPaidAmount,
                    remaining,
                    status: remaining > 0 ? client_1.PaymentStatus.PARTIAL_PAID : client_1.PaymentStatus.PAID,
                    reviewStatus: 'APPROVED',
                    paymentDate: new Date(),
                },
            });
            let partnerShares = [];
            if (loan.source === client_1.LoanFundSource.GENERAL) {
                partnerShares = await tx.loanPartnerShare.findMany({
                    where: { loanId: loan.id, isActive: true },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
                partnerShares = await tx.loanNewCapitalShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new common_1.BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;
            for (const ps of partnerShares) {
                const sharePercent = loan.source === client_1.LoanFundSource.GENERAL
                    ? Number(ps.sharePercent || 0)
                    : Number(ps.percent || 0);
                const partnerPercentage = sharePercent / 100;
                const orgCutPercent = Number(ps.partner.orgProfitPercent || 0);
                const rawShare = Number((interestPart * partnerPercentage).toFixed(2));
                const companyCut = Number((rawShare * orgCutPercent / 100).toFixed(2));
                const partnerFinal = Number((rawShare - companyCut).toFixed(2));
                if (rawShare === 0 && companyCut === 0)
                    continue;
                await tx.partnerShareAccrual.create({
                    data: {
                        periodId,
                        partnerId: ps.partnerId,
                        loanId: loan.id,
                        repaymentId: repayment.id,
                        rawShare,
                        companyCut,
                        partnerFinal,
                        isClosed: false,
                    },
                });
            }
            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'UPDATE',
                    description: `قام المستخدم بعمل سداد جزئي للدفعة رقم ${id} بمبلغ ${paidAmount}`,
                },
            });
            return {
                message: 'تم تسجيل السداد الجزئي بنجاح',
                repaymentId: id,
                paidAmount: newPaidAmount,
                remaining,
                principalPart,
                interestPart,
            };
        });
    }
    async markLoanAsEarlyPaid(loanId, earlyPaymentDiscount, currentUserId) {
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                repayments: { orderBy: { dueDate: 'asc' } },
                client: true,
            },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUserId } });
        const unpaidRepayments = loan.repayments.filter(r => r.status !== 'PAID' && r.status !== 'EARLY_PAID');
        if (unpaidRepayments.length === 0)
            throw new common_1.BadRequestException('لا توجد دفعات للسداد');
        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;
        unpaidRepayments.forEach(rep => {
            const remainingPrincipal = rep.principalAmount - (rep.paidAmount || 0);
            const paidInterest = Math.max((rep.paidAmount || 0) - rep.principalAmount, 0);
            const remainingInterest = rep.amount - rep.principalAmount - paidInterest;
            totalRemainingPrincipal += Math.max(remainingPrincipal, 0);
            totalRemainingInterest += Math.max(remainingInterest, 0);
        });
        if (earlyPaymentDiscount > totalRemainingInterest) {
            throw new common_1.BadRequestException(`الخصم لا يمكن ان يتعدي باقي الفائدة (${totalRemainingInterest.toFixed(2)})`);
        }
        let finalPayment = totalRemainingPrincipal + (totalRemainingInterest - earlyPaymentDiscount);
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });
        if (!loansReceivable || !loanIncome)
            throw new common_1.BadRequestException('Missing required accounts setup');
        let creditAccount;
        if (loan.source === client_1.LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
        }
        else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
        }
        const roundToTwo = (num) => Math.round(num * 100) / 100;
        finalPayment = roundToTwo(finalPayment);
        totalRemainingPrincipal = roundToTwo(totalRemainingPrincipal);
        totalRemainingInterest = roundToTwo(totalRemainingInterest);
        return await this.prisma.$transaction(async (tx) => {
            const journal = await this.journalService.createJournal({
                reference: `EARLY-${loan.id}`,
                description: `سداد مبكر للسلفة رقم ${loan.code} بخصم مبلغ ${earlyPaymentDiscount}`,
                type: 'GENERAL',
                sourceType: client_1.JournalSourceType.LOAN,
                sourceId: loan.id,
                lines: [
                    { accountId: creditAccount.id, debit: finalPayment, credit: 0, description: `استلام سداد مبكر من العميل ${loan.client.name}` },
                    { accountId: loansReceivable.id, debit: 0, credit: totalRemainingPrincipal, description: 'سداد أصل السلفة بالكامل', clientId: loan.client.id },
                    { accountId: loanIncome.id, debit: 0, credit: totalRemainingInterest - earlyPaymentDiscount, description: 'دخل الفائدة بعد خصم السداد المبكر', clientId: loan.client.id, },
                ],
            }, currentUserId);
            const discountRatio = earlyPaymentDiscount / totalRemainingInterest;
            let interestDistributed = 0;
            for (const [index, rep] of unpaidRepayments.entries()) {
                const alreadyPaid = rep.paidAmount || 0;
                const remainingPrincipal = rep.principalAmount - alreadyPaid;
                const paidInterest = Math.max(alreadyPaid - rep.principalAmount, 0);
                const remainingInterest = rep.amount - rep.principalAmount - paidInterest;
                let interestDiscount = parseFloat((remainingInterest * discountRatio).toFixed(2));
                let interestPortion = parseFloat((remainingInterest - interestDiscount).toFixed(2));
                if (index === unpaidRepayments.length - 1) {
                    interestPortion = parseFloat((totalRemainingInterest - earlyPaymentDiscount - interestDistributed).toFixed(2));
                    interestDiscount = remainingInterest - interestPortion;
                }
                else {
                    interestDistributed += interestPortion;
                }
                const newPaidAmount = parseFloat((remainingPrincipal + interestPortion + alreadyPaid).toFixed(2));
                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        status: 'EARLY_PAID',
                        paidAmount: newPaidAmount,
                        interestAmount: interestPortion,
                        remaining: 0,
                        paymentDate: new Date(),
                        reviewStatus: 'APPROVED',
                        notes: `تم السداد المبكر مع خصم الفائدة ${interestDiscount.toFixed(2)}`,
                    },
                });
            }
            let partnerShares = [];
            if (loan.source === client_1.LoanFundSource.GENERAL) {
                partnerShares = await tx.loanPartnerShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
                partnerShares = await tx.loanNewCapitalShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }
            const realizedInterest = totalRemainingInterest - earlyPaymentDiscount;
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new common_1.BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;
            if (realizedInterest > 0) {
                for (const ps of partnerShares) {
                    const sharePercent = loan.source === client_1.LoanFundSource.GENERAL
                        ? Number(ps.sharePercent || 0)
                        : Number(ps.percent || 0);
                    const orgCutPercent = Number(ps.partner.orgProfitPercent || 0);
                    const rawShare = Number(((realizedInterest * sharePercent) / 100).toFixed(2));
                    const companyCut = Number(((rawShare * orgCutPercent) / 100).toFixed(2));
                    const partnerFinal = Number((rawShare - companyCut).toFixed(2));
                    if (rawShare === 0 && companyCut === 0)
                        continue;
                    await tx.partnerShareAccrual.create({
                        data: {
                            periodId,
                            loanId: loan.id,
                            repaymentId: null,
                            partnerId: ps.partnerId,
                            rawShare,
                            companyCut,
                            partnerFinal,
                        },
                    });
                }
            }
            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    status: 'COMPLETED',
                    earlyPaidAmount: totalRemainingPrincipal + totalRemainingInterest,
                    earlyPaymentDiscount,
                    endDate: new Date(),
                    settlementJournalId: journal.journal.id,
                    newAmount: loan.totalAmount - earlyPaymentDiscount,
                },
            });
            await tx.auditLog.create({
                data: {
                    userId: currentUserId,
                    screen: 'Loans',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بتسديد السلفة رقم ${loan.code} مبكرًا بخصم ${earlyPaymentDiscount} على الفائدة.`,
                },
            });
            return {
                message: 'تم تسجيل السداد المبكر بنجاح',
                finalPayment: finalPayment.toFixed(2),
                journalId: journal.journal.id,
            };
        });
    }
    async approveMany(currentUser, ids, dto) {
        if (!ids || ids.length === 0)
            throw new common_1.BadRequestException('No repayment IDs provided');
        const results = [];
        for (const id of ids) {
            try {
                const res = await this.approveRepayment(currentUser, id, dto);
                results.push({ id, status: 'success', message: res.message, journalId: res.journalId });
            }
            catch (error) {
                results.push({ id, status: 'failed', message: error.message });
            }
        }
        return results;
    }
    async rejectMany(currentUser, ids, dto) {
        if (!ids || ids.length === 0)
            throw new common_1.BadRequestException('No repayment IDs provided');
        const results = [];
        for (const id of ids) {
            try {
                const res = await this.rejectRepayment(currentUser, id, dto);
                results.push({ id, status: 'success', message: res.message });
            }
            catch (error) {
                results.push({ id, status: 'failed', message: error.message });
            }
        }
        return results;
    }
    async uploadPaymentProofBulk(currentUser, repaymentIds, file) {
        if (!repaymentIds || repaymentIds.length === 0) {
            throw new common_1.BadRequestException('يجب إرسال معرفات الدفعات');
        }
        if (!file) {
            throw new common_1.BadRequestException('No file uploaded');
        }
        const ids = Array.isArray(repaymentIds)
            ? repaymentIds.map(id => Number(id))
            : [Number(repaymentIds)];
        if (!ids.length || ids.some(id => !Number.isInteger(id))) {
            throw new common_1.BadRequestException('Invalid repaymentIds');
        }
        const repayments = await this.prisma.repayment.findMany({
            where: { id: { in: ids } },
            include: { client: true },
        });
        if (repayments.length !== repaymentIds.length) {
            throw new common_1.BadRequestException('بعض الدفعات غير موجودة');
        }
        const nationalIds = new Set(repayments.map(r => r.client?.nationalId));
        if (nationalIds.size !== 1) {
            throw new common_1.BadRequestException('يجب أن تكون جميع الدفعات لنفس العميل');
        }
        const nationalId = repayments[0].client?.nationalId;
        if (!nationalId) {
            throw new common_1.BadRequestException('Client national ID not found');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', nationalId);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filename = `اثبات-السداد-${ids[0]}${path.extname(file.originalname)}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path
            .relative(process.cwd(), filePath)
            .replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        for (const repayment of repayments) {
            if (typeof repayment.PaymentProof === 'string') {
                try {
                    const urlPath = new URL(repayment.PaymentProof).pathname;
                    const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                    if (fs.existsSync(prevLocal)) {
                        fs.unlinkSync(prevLocal);
                    }
                }
                catch { }
            }
            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { PaymentProof: publicUrl },
            });
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'CREATE',
                    description: `قام المستخدم ${user?.name} بتحميل اثبات سداد مشترك للدفعة رقم ${repayment.id}`,
                },
            });
        }
        return {
            message: 'تم رفع إثبات السداد بنجاح لجميع الدفعات',
            fileUrl: publicUrl,
            repaymentsCount: repayments.length,
        };
    }
};
exports.RepaymentService = RepaymentService;
exports.RepaymentService = RepaymentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService,
        notification_service_1.NotificationService])
], RepaymentService);
//# sourceMappingURL=repayment.service.js.map