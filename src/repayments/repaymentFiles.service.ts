import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class RepaymentFilesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
        private readonly notificationService: NotificationService,
    ) { }

    async uploadReceipts(currentUser, id: number, files: Express.Multer.File[]) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!files || files.length === 0) throw new BadRequestException('No files uploaded');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadsDir = path.join(process.cwd(), 'uploads', 'clients', repayment.client?.nationalId || 'unknown', 'repayments');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });


        if (Array.isArray(repayment.attachments)) {
            for (const fileUrl of repayment.attachments) {
                try {
                    const urlPath = new URL(fileUrl).pathname;
                    const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                    if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
                } catch { }
            }
        } else if (typeof repayment.attachments === 'string') {
            try {
                const urlPath = new URL(repayment.attachments).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
            } catch { }
        }


        const fileUrls: string[] = [];

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
                status: PaymentStatus.PENDING_REVIEW,
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

    async uploadPaymentProof(currentUser, id: number, file: Express.Multer.File) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });

        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!file) throw new BadRequestException('No file uploaded');

        const nationalId = repayment.client?.nationalId;
        if (!nationalId) throw new BadRequestException('Client national ID not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const proofsCount = await this.prisma.repaymentPayment.count({
            where: { repaymentId: id },
        });

        let filename: string;
        if (proofsCount > 0) {
            const next = proofsCount + 1;
            filename = `${id}-اثبات-سداد-${next}${path.extname(file.originalname)}`;
        } else {
            filename = `${id}-اثبات-السداد${path.extname(file.originalname)}`;
        }

        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);

        const prevFileUrl = typeof repayment.PaymentProof === 'string' ? repayment.PaymentProof : undefined;
        if (prevFileUrl) {
            try {
                const urlPath = new URL(prevFileUrl).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
            } catch {
            }
        }

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        await this.prisma.repayment.update({
            where: { id },
            data: { PaymentProof: publicUrl }
        });

        await this.prisma.repaymentPayment.create({
            data: {
                repaymentId: repayment.id,
                proofUrl: publicUrl,
            },
        });

        const lastRepaymentCount = await this.prisma.repaymentCount.findFirst({
            orderBy: { count: 'desc' },
        });

        const newCount = lastRepaymentCount ? lastRepaymentCount.count + 1 : 1;

        await this.prisma.repaymentCount.create({
            data: {
                repaymentId: repayment.id,
                count: newCount,
            },
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

    async uploadPaymentProofBulk(
        currentUser: number,
        repaymentIds: number[],
        file: Express.Multer.File,
    ) {
        if (!repaymentIds || repaymentIds.length === 0) {
            throw new BadRequestException('يجب إرسال معرفات الدفعات');
        }

        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const ids = Array.isArray(repaymentIds)
            ? repaymentIds.map(id => Number(id))
            : [Number(repaymentIds)];

        if (!ids.length || ids.some(id => !Number.isInteger(id))) {
            throw new BadRequestException('Invalid repaymentIds');
        }

        const repayments = await this.prisma.repayment.findMany({
            where: { id: { in: ids } },
            include: { client: true },
        });

        if (repayments.length !== repaymentIds.length) {
            throw new BadRequestException('بعض الدفعات غير موجودة');
        }

        const nationalIds = new Set(
            repayments.map(r => r.client?.nationalId),
        );

        if (nationalIds.size !== 1) {
            throw new BadRequestException('يجب أن تكون جميع الدفعات لنفس العميل');
        }

        const nationalId = repayments[0].client?.nationalId;
        if (!nationalId) {
            throw new BadRequestException('Client national ID not found');
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
                    const prevLocal = path.join(
                        process.cwd(),
                        urlPath.replace(/^\//, ''),
                    );
                    if (fs.existsSync(prevLocal)) {
                        fs.unlinkSync(prevLocal);
                    }
                } catch { }
            }

            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { PaymentProof: publicUrl },
            });

            await this.prisma.repaymentPayment.create({
                data: {
                    repaymentId: repayment.id,
                    proofUrl: publicUrl,
                },
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

        const lastRepaymentCount = await this.prisma.repaymentCount.findFirst({
            orderBy: { count: 'desc' },
        });

        const newCount = lastRepaymentCount ? lastRepaymentCount.count + 1 : 1;

        await this.prisma.repaymentCount.create({
            data: {
                repaymentId: repayments[0].id,
                count: newCount,
            },
        });

        return {
            message: 'تم رفع إثبات السداد بنجاح لجميع الدفعات',
            fileUrl: publicUrl,
            repaymentsCount: repayments.length,
        };
    }

    async getNextRepaymentCount(): Promise<number> {
        const lastRepaymentCount = await this.prisma.repaymentCount.findFirst({
            orderBy: { count: 'desc' },
        });

        return lastRepaymentCount ? lastRepaymentCount.count + 1 : 1;
    }
}