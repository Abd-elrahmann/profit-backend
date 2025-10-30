import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import * as fs from 'fs';
import * as path from 'path';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType, JournalType } from '@prisma/client';


@Injectable()
export class PartnerService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // CREATE PARTNER
    async createPartner(dto: CreatePartnerDto, userId?: number) {
        const existing = await this.prisma.partner.findFirst({
            where: { nationalId: dto.nationalId },
        });
        if (existing) throw new BadRequestException('Partner with this national ID already exists');

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

        const partner = await this.prisma.partner.create({
            data: {
                name: dto.name,
                nationalId: dto.nationalId,
                address: dto.address,
                phone: dto.phone,
                email: dto.email,
                orgProfitPercent: dto.orgProfitPercent,
                capitalAmount: dto.capitalAmount,
                contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : null,
                mudarabahFileUrl: dto.mudarabahFileUrl,
                isActive: dto.isActive ?? true,
                accountPayableId: payableAccount.id,
                accountEquityId: equityAccount.id,
            },
            include: {
                AccountPayable: true,
                AccountEquity: true,
            },
        });

        const journalDto = {
            reference: `CAP-${partner.id}`,
            description: `إيداع رأس مال الشريك ${partner.name}`,
            type: JournalType.GENERAL,
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

        await this.journalService.createJournal(journalDto, userId);

        return { message: 'Partner created successfully with capital journal', partner };
    }

    // UPDATE PARTNER
    async updatePartner(id: number, dto: UpdatePartnerDto) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner) throw new NotFoundException('Partner not found');

        const updated = await this.prisma.partner.update({
            where: { id },
            data: {
                ...dto,
                contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : partner.contractSignedAt,
            },
        });

        return { message: 'Partner updated successfully', partner: updated };
    }

    // DELETE PARTNER
    async deletePartner(id: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: { AccountPayable: true, AccountEquity: true },
        });
        if (!partner) throw new NotFoundException('Partner not found');

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
            await tx.partner.delete({ where: { id } });
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountPayableId } });
            await tx.journalLine.deleteMany({ where: { accountId: partner.accountEquityId } });
            await tx.journalHeader.deleteMany({
                where: {
                    lines: { some: { accountId: { in: [partner.accountPayableId, partner.accountEquityId] } } },
                },
            });
            await tx.account.delete({ where: { id: partner.accountPayableId } });
            await tx.account.delete({ where: { id: partner.accountEquityId } });
        });

        return { message: 'Partner and related accounts deleted successfully' };
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
            _sum: { capitalAmount: true },
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
            },
        });
        const totalCapital = totalActiveCapital._sum.capitalAmount || 0;

        // Add partnerProfitPercent dynamically
        const enrichedPartners = partners.map(p => ({
            ...p,
            partnerProfitPercent: totalCapital > 0 ? Number(((p.capitalAmount / totalCapital) * 100).toFixed(2)) : 0,
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
            },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        const totalActiveCapital = await this.prisma.partner.aggregate({
            _sum: { capitalAmount: true },
            where: { isActive: true },
        });

        const totalCapital = totalActiveCapital._sum.capitalAmount || 0;
        const partnerProfitPercent = totalCapital > 0 ? Number(((partner.capitalAmount / totalCapital) * 100).toFixed(2)) : 0;

        return {
            ...partner,
            partnerProfitPercent,
        };
    }

    // UPLOAD MUDARABAH FILE
    async uploadMudarabahFile(id: number, file: Express.Multer.File) {
        const partner = await this.prisma.partner.findUnique({ where: { id } });
        if (!partner) throw new NotFoundException('Partner not found');

        if (!file) throw new BadRequestException('No file uploaded');

        const uploadDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        if (partner.mudarabahFileUrl) {
            try {
                let existingRelative = partner.mudarabahFileUrl;
                if (existingRelative.startsWith('http')) {
                    existingRelative = decodeURI(existingRelative.replace('http://localhost:3000/', ''));
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
        const publicUrl = `http://localhost:3000/${encodeURI(relPath)}`;

        // Update database with public URL
        await this.prisma.partner.update({
            where: { id },
            data: { mudarabahFileUrl: publicUrl },
        });

        return { message: 'File uploaded successfully', path: publicUrl };
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
}