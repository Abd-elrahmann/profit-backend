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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ZakatSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZakatSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const luxon_1 = require("luxon");
const safe_1 = __importDefault(require("hijri-date/lib/safe"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const puppeteer_1 = __importDefault(require("puppeteer"));
let ZakatSchedulerService = ZakatSchedulerService_1 = class ZakatSchedulerService {
    prisma;
    journalService;
    logger = new common_1.Logger(ZakatSchedulerService_1.name);
    round2(v) {
        return Math.round((v + Number.EPSILON) * 100) / 100;
    }
    numberToArabicWords(num) {
        const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
        const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
        const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
        if (num === 0)
            return 'صفر';
        if (num < 10)
            return ones[num];
        let words = '';
        const h = Math.floor(num / 100);
        const t = Math.floor((num % 100) / 10);
        const o = num % 10;
        if (h > 0)
            words += hundreds[h] + ' ';
        if (t > 1) {
            words += tens[t] + ' ';
            if (o > 0)
                words += 'و' + ones[o] + ' ';
        }
        else if (t === 1) {
            if (o === 0)
                words += 'عشرة';
            else if (o === 1)
                words += 'أحد عشر';
            else if (o === 2)
                words += 'اثنا عشر';
            else
                words += ones[o] + ' عشر';
        }
        else {
            if (o > 0)
                words += ones[o] + ' ';
        }
        return words.trim();
    }
    fillTemplate(template, context) {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const value = context[key.trim()];
            return value !== undefined ? String(value) : '';
        });
    }
    async generatePdfFromHtml(html, filename) {
        const dir = path.join(process.cwd(), 'uploads', 'zakat');
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        const browser = await puppeteer_1.default.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();
        return filePath;
    }
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    async runMonthlyZakat() {
        const now = (0, moment_timezone_1.default)().tz('Asia/Riyadh');
        const today = now.date();
        const lastDay = now.endOf('month').date();
        if (today !== lastDay) {
            this.logger.log(`Skipping... today is ${today}, last day is ${lastDay}`);
            return;
        }
        const year = now.year();
        const month = now.month() + 1;
        this.logger.log(`Running monthly zakat job for ${year}-${month}`);
        const accruals = await this.prisma.zakatAccrual.findMany({
            where: { year, month },
            include: { partner: true },
        });
        const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakat)
            throw new common_1.BadRequestException('zakat account (20001) must exist');
        for (const acc of accruals) {
            const partner = acc.partner;
            const amount = this.round2(acc.amount);
            const zakatPayment = await this.prisma.zakatPayment.create({
                data: {
                    partnerId: partner.id,
                    year,
                    month,
                    amount,
                },
            });
            const journal = await this.journalService.createJournal({
                reference: `ZAKAT-${partner.id}-${year}-${month}`,
                description: `دفع زكاة شهرية لشريك ${partner.name}`,
                type: 'GENERAL',
                sourceType: 'ZAKAT',
                sourceId: zakatPayment.id,
                lines: [
                    {
                        accountId: zakat.id,
                        debit: 0,
                        credit: amount,
                        description: 'مصروف زكاة',
                    },
                    {
                        accountId: partner.accountEquityId,
                        debit: amount,
                        credit: 0,
                        description: 'التزام زكاة',
                    },
                ],
            }, 1);
            await this.journalService.postJournal(journal.journal.id, 1);
            const template = await this.prisma.template.findUnique({
                where: { name: 'PAYMENT_VOUCHER' },
            });
            if (!template) {
                this.logger.error('PAYMENT_VOUCHER template missing!');
                continue;
            }
            const todayG = luxon_1.DateTime.now().setZone('Asia/Riyadh').toFormat('yyyy-MM-dd');
            const todayH = new safe_1.default();
            const hijriDateFormatted = `${todayH.getFullYear()}-${todayH.getMonth() + 1}-${todayH.getDate()}`;
            const context = {
                رقم_السند: zakatPayment.id,
                التاريخ_الهجري: hijriDateFormatted,
                التاريخ_الميلادي: todayG,
                سبب_الصرف: `دفع زكاة مستحقة لشهر ${month}-${year}`,
                المبلغ_رقما: amount.toFixed(2),
                المبلغ_كتابة: this.numberToArabicWords(amount),
                اسم_المساهم: partner.name,
                رقم_هوية_المساهم: partner.nationalId ?? '---',
                اسم_المستلم: partner.name,
                رقم_هوية_المستلم: partner.nationalId ?? '---',
            };
            const filledHtml = this.fillTemplate(template.content, context);
            const pdfFilename = `zakat-${zakatPayment.id}.pdf`;
            const pdfPath = await this.generatePdfFromHtml(filledHtml, pdfFilename);
            const fileUrl = `${process.env.URL}uploads/zakat/${pdfFilename}`;
            await this.prisma.zakatPayment.update({
                where: { id: zakatPayment.id },
                data: {
                    PAYMENT_VOUCHER: fileUrl,
                },
            });
            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    capitalAmount: { decrement: amount },
                    totalAmount: { decrement: amount },
                    yearlyZakatPaid: {
                        increment: amount,
                    },
                },
            });
        }
        this.logger.log(`Monthly zakat job completed.`);
    }
    async runYearEndZakatSettlement() {
        const year = (0, moment_timezone_1.default)().tz('Asia/Riyadh').year();
        this.logger.log(`Running year-end zakat reconciliation for ${year}`);
        const partners = await this.prisma.partner.findMany();
        const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakat)
            throw new common_1.BadRequestException('zakat account (20001) must exist');
        for (const p of partners) {
            const annualZakat = this.round2(p.totalAmount * 0.025);
            const paid = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });
            const paidAmount = this.round2(paid._sum.amount || 0);
            const diff = this.round2(annualZakat - paidAmount);
            if (diff !== 0) {
                const zakatPayment = await this.prisma.zakatPayment.create({
                    data: {
                        partnerId: p.id,
                        year,
                        month: null,
                        amount: diff,
                    },
                });
                await this.journalService.createJournal({
                    reference: `ZAKAT-YEAR-END-${p.id}-${year}`,
                    description: `تسوية زكاة نهاية السنة لشريك ${p.name}`,
                    type: 'ADJUSTMENT',
                    sourceType: 'ZAKAT',
                    sourceId: zakatPayment.id,
                    lines: diff > 0
                        ? [
                            {
                                accountId: zakat.id,
                                debit: 0,
                                credit: diff,
                                description: 'مصروف زكاة إضافي',
                            },
                            {
                                accountId: p.accountEquityId,
                                debit: diff,
                                credit: 0,
                                description: 'التزام زكاة إضافية',
                            },
                        ]
                        : [
                            {
                                accountId: p.accountEquityId,
                                debit: 0,
                                credit: Math.abs(diff),
                                description: 'تخفيض التزام زكاة',
                            },
                            {
                                accountId: zakat.id,
                                debit: Math.abs(diff),
                                credit: 0,
                                description: 'فائض زكاة مرحل',
                            },
                        ],
                }, 1);
            }
            await this.prisma.partner.update({
                where: { id: p.id },
                data: {
                    capitalAmount: { decrement: diff },
                    totalAmount: { decrement: diff },
                    yearlyZakatBalance: diff,
                    yearlyZakatRequired: annualZakat,
                    yearlyZakatPaid: paidAmount,
                },
            });
        }
        this.logger.log(`Year-end zakat reconciliation completed.`);
    }
    async runNextYearZakatAccruals() {
        const now = (0, moment_timezone_1.default)().tz('Asia/Riyadh');
        const nextYear = now.year() + 1;
        this.logger.log(`Running next year zakat accruals for ${nextYear}`);
        const partners = await this.prisma.partner.findMany();
        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount)
            throw new common_1.BadRequestException('Zakat account (20001) must exist');
        for (const partner of partners) {
            const annualZakat = this.round2(partner.totalAmount * 0.025);
            const monthlyZakat = this.round2(annualZakat / 12);
            for (let month = 1; month <= 12; month++) {
                await this.prisma.zakatAccrual.create({
                    data: {
                        partnerId: partner.id,
                        year: nextYear,
                        month,
                        amount: monthlyZakat,
                    },
                });
            }
            this.logger.log(`Created 12 monthly zakat accruals for partner ${partner.name} (${partner.id})`);
        }
        this.logger.log(`Next year zakat accruals job completed for ${nextYear}`);
    }
};
exports.ZakatSchedulerService = ZakatSchedulerService;
__decorate([
    (0, schedule_1.Cron)('5 0 28-31 * *', {
        timeZone: 'Asia/Riyadh',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatSchedulerService.prototype, "runMonthlyZakat", null);
__decorate([
    (0, schedule_1.Cron)('55 23 31 12 *', {
        timeZone: 'Asia/Riyadh',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatSchedulerService.prototype, "runYearEndZakatSettlement", null);
__decorate([
    (0, schedule_1.Cron)('0 0 1 1 *', {
        timeZone: 'Asia/Riyadh',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatSchedulerService.prototype, "runNextYearZakatAccruals", null);
exports.ZakatSchedulerService = ZakatSchedulerService = ZakatSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], ZakatSchedulerService);
//# sourceMappingURL=zakat.scheduler.js.map