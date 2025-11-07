import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/notification.dto';
import { NotificationType } from '@prisma/client';
import { WhatsappService } from './api/whatsapp.service';
import { TelegramService } from './api/telegram.service';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class NotificationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly whatsappService: WhatsappService,
        private readonly telegramService: TelegramService,
    ) { }

    // Replace placeholders in template
    private fillTemplate(template: string, context: Record<string, any>): string {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const value = context[key.trim()];
            return value !== undefined ? String(value) : '';
        });
    }

    // Create and send a notification
    async sendNotification(dto: SendNotificationDto) {
        const { templateType, clientId, loanId, repaymentId, channel } = dto;

        const template = await this.prisma.template.findUnique({
            where: { name: templateType },
        });
        if (!template) throw new NotFoundException('Template not found');

        const client = clientId
            ? await this.prisma.client.findUnique({ where: { id: clientId } })
            : null;
        const loan = loanId
            ? await this.prisma.loan.findUnique({ where: { id: loanId } })
            : null;
        const repayment = repaymentId
            ? await this.prisma.repayment.findUnique({ where: { id: repaymentId } })
            : null;

        const context = {
            clientName: client?.name,
            loanCode: loan?.code,
            amount: repayment?.amount ?? loan?.amount,
            dueDate: repayment?.dueDate?.toISOString().split('T')[0],
            paymentDate: repayment?.paymentDate?.toISOString().split('T')[0],
            repaymentNumber: repayment?.count,
            paymentLink: repayment
                ? `${process.env.FRONT}payment-receipt/${loan?.id}/${repayment?.id}/${encodeURIComponent(client?.name || '')}`
                : '',
        };

        const message = this.fillTemplate(template.content, context);

        const notification = await this.prisma.notification.create({
            data: {
                title: templateType.replaceAll('_', ' '),
                message,
                type: templateType as NotificationType,
                clientId,
                loanId,
                repaymentId,
                channel: channel ?? 'WHATSAPP',
                sentAt: new Date(),
            },
        });

        if (channel === 'WHATSAPP' && client?.phone) {
            await this.whatsappService.sendMessage(client.phone, message);
        } else if (channel === 'TELEGRAM' && client?.telegramChatId) {
            const chatId = client?.telegramChatId;
            await this.telegramService.sendMessage(chatId, message);
        }

        console.log(`✅ Notification ready to send:`, message);

        return {
            message: 'Notification created successfully',
            data: notification,
        };
    }

    // Get all notifications
    async getAllNotifications(page: number = 1, limit: number = 10, filters?: any) {
        const where: any = {};

        // Filter by notification type
        if (filters?.type) where.type = filters.type;

        // Filter by related client name
        if (filters?.clientName) {
            where.client = {
                name: { contains: filters.clientName, mode: 'insensitive' },
            };
        }

        // Filter by related loan code
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

    // Get by client
    async getByClient(clientId: number) {
        return this.prisma.notification.findMany({
            where: { clientId },
            orderBy: { createdAt: 'desc' },
        });
    }
}