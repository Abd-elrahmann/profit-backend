import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ClientStatusService } from '../client/client-status.service';
import { LoanStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class loansFilesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
        private readonly clientStatusService: ClientStatusService,
    ) {}

    async uploadDebtAcknowledgmentFile(currentUser: number, loanId: number, file: Express.Multer.File, contractNumbers?: { debtAcknowledgmentNumber?: string }) {
        if (!file) throw new BadRequestException('No file uploaded');

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `DEBT_ACK_${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${relPath}`;


        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                DEBT_ACKNOWLEDGMENT: publicUrl,
                debtAcknowledgmentNumber: contractNumbers?.debtAcknowledgmentNumber
            },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل إقرار الدين للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });


        return { message: 'تم تحميل إقرار الدين بنجاح', path: publicUrl };
    }

    async uploadPromissoryNoteFile(currentUser: number, loanId: number, file: Express.Multer.File, contractNumbers?: { promissoryNoteNumber?: string }) {
        if (!file) throw new BadRequestException('No file uploaded');


        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


        const ext = path.extname(file.originalname);
        const fileName = `PROMISSORY_${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);


        fs.writeFileSync(filePath, file.buffer);


        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${relPath}`;


        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                PROMISSORY_NOTE: publicUrl,
                promissoryNoteNumber: contractNumbers?.promissoryNoteNumber
            },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل سند لأمر للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل سند لأمر بنجاح', path: publicUrl };
    }

    async uploadSettlementFile(currentUser: number, loanId: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');


        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status == LoanStatus.COMPLETED) {
            throw new BadRequestException('فقط السلف المكتملة يمكن تحميل ملف التسوية لها');
        }

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `SETTLEMENT_${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${relPath}`;

        const totalPaidAmount = await this.prisma.repayment.aggregate({
            where: { loanId: loan.id },
            _sum: { paidAmount: true },
        }).then(res => res._sum.paidAmount || 0);

        await this.prisma.loan.update({
            where: { id: loan.id },
            data: {
                SETTLEMENT: publicUrl,
                status: 'COMPLETED',
                endDate: new Date(),
                newAmount: totalPaidAmount
            },
        });

        await this.clientStatusService.updateClientStatus(loan.clientId);

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ملف التسوية للقرض رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل ملف التسوية بنجاح', path: publicUrl };
    }

    async saveContractNumbers(currentUser: number, loanId: number, contractNumbers: { debtAcknowledgmentNumber?: string; promissoryNoteNumber?: string }) {
        const updateData: any = {};

        if (contractNumbers.debtAcknowledgmentNumber) {
            updateData.debtAcknowledgmentNumber = contractNumbers.debtAcknowledgmentNumber;
        }

        if (contractNumbers.promissoryNoteNumber) {
            updateData.promissoryNoteNumber = contractNumbers.promissoryNoteNumber;
        }

        if (Object.keys(updateData).length === 0) {
            throw new BadRequestException('No contract numbers provided');
        }

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
        });

        if (!loan) throw new NotFoundException('Loan not found');

        const updatedLoan = await this.prisma.loan.update({
            where: { id: loanId },
            data: updateData,
        });


        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث أرقام العقود للسلفة رقم ${loan.code}`,
            },
        });

        return { message: 'تم حفظ أرقام العقود بنجاح', loan: updatedLoan };
    }
}