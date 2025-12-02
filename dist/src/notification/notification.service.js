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
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const whatsapp_service_1 = require("./api/whatsapp.service");
const telegram_service_1 = require("./api/telegram.service");
const dotenv = __importStar(require("dotenv"));
const CryptoJS = __importStar(require("crypto-js"));
dotenv.config();
let NotificationService = class NotificationService {
    prisma;
    whatsappService;
    telegramService;
    constructor(prisma, whatsappService, telegramService) {
        this.prisma = prisma;
        this.whatsappService = whatsappService;
        this.telegramService = telegramService;
    }
    generateShortToken(data) {
        const secret = process.env.PAYMENT_SECRET;
        const json = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(json, secret).toString();
        return encrypted.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    decryptShortToken(token) {
        const secret = process.env.PAYMENT_SECRET;
        let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        try {
            const bytes = CryptoJS.AES.decrypt(base64, secret);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (!decrypted)
                throw new Error("Invalid token or wrong secret");
            return JSON.parse(decrypted);
        }
        catch (err) {
            throw new Error("Failed to decrypt token: " + err.message);
        }
    }
    fillTemplate(template, context) {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const value = context[key.trim()];
            return value !== undefined ? String(value) : '';
        });
    }
    async sendNotification(dto) {
        const { templateType, clientId, loanId, repaymentId, channel } = dto;
        const template = await this.prisma.template.findUnique({
            where: { name: templateType },
        });
        if (!template)
            throw new common_1.NotFoundException('Template not found');
        const client = clientId
            ? await this.prisma.client.findUnique({ where: { id: clientId } })
            : null;
        const loan = loanId
            ? await this.prisma.loan.findUnique({ where: { id: loanId } })
            : null;
        const repayment = repaymentId
            ? await this.prisma.repayment.findUnique({ where: { id: repaymentId } })
            : null;
        const token = this.generateShortToken({
            loanId: loan?.id,
            repaymentId: repayment?.id,
            clientName: client?.name,
        });
        const context = {
            clientName: client?.name,
            loanCode: loan?.code,
            amount: repayment?.amount ?? loan?.amount,
            dueDate: repayment?.dueDate?.toISOString().split('T')[0],
            paymentDate: repayment?.paymentDate?.toISOString().split('T')[0],
            repaymentNumber: repayment?.count,
            paymentLink: `${process.env.FRONT}payment-receipt?token=${token}`,
        };
        const message = this.fillTemplate(template.content, context);
        const notification = await this.prisma.notification.create({
            data: {
                title: templateType.replaceAll('_', ' '),
                message,
                type: templateType,
                clientId,
                loanId,
                repaymentId,
                channel: channel ?? 'WHATSAPP',
                sentAt: new Date(),
            },
        });
        if (channel === 'WHATSAPP' && client?.phone) {
            await this.whatsappService.sendMessage(client.phone, message);
        }
        else if (channel === 'TELEGRAM' && client?.telegramChatId) {
            const chatId = client?.telegramChatId;
            await this.telegramService.sendMessage(chatId, message);
        }
        console.log(`✅ Notification ready to send:`, message);
        return {
            message: 'تم ارسال الإشعار بنجاح',
            data: notification,
        };
    }
    async getAllNotifications(page = 1, limit = 10, filters) {
        const where = {};
        if (filters?.type)
            where.type = filters.type;
        if (filters?.clientName) {
            where.client = {
                name: { contains: filters.clientName, mode: 'insensitive' },
            };
        }
        if (filters?.loanCode) {
            where.loan = {
                code: { contains: filters.loanCode, mode: 'insensitive' },
            };
        }
        const notifications = await this.prisma.notification.findMany({
            where,
            include: {
                client: true,
                loan: true,
                repayment: true,
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
        });
        const total = await this.prisma.notification.count({ where });
        return {
            total,
            page,
            limit,
            data: notifications,
        };
    }
    async getByClient(clientId) {
        return this.prisma.notification.findMany({
            where: { clientId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async decodeToken(token) {
        const data = this.decryptShortToken(token);
        return {
            data,
        };
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_service_1.WhatsappService,
        telegram_service_1.TelegramService])
], NotificationService);
//# sourceMappingURL=notification.service.js.map