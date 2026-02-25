import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto, KafeelDto, UpdateKafeelDto } from './dto/client.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
import { PaymentStatus, LoanStatus, ClientStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { not } from 'rxjs/internal/util/not';

@Injectable()
export class ClientService {
    constructor(private prisma: PrismaService) { }


    async createClient(
        currentUser: number,
        dto: CreateClientDto,
        files?: Record<string, Array<Express.Multer.File>>,
    ) {

        const exists = await this.prisma.client.findFirst({
            where: { OR: [{ phone: dto.phone }, { nationalId: dto.nationalId }] },
        });
        if (exists) throw new BadRequestException('العميل موجود مسبقاً');

        if (!files?.clientIdImage?.length) {
            throw new BadRequestException('صورة هوية العميل مطلوبة');
        }

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        const client = await this.prisma.$transaction(async (tx) => {
            const { kafeel: kafeelList, documents: docDto, ...clientData } = dto;


            const newClient = await tx.client.create({
                data: {
                    ...clientData,
                    birthDate: new Date(dto.birthDate),
                    status: dto.status ?? ClientStatus.نشط,
                },
                select: { id: true, name: true, nationalId: true },
            });


            const prefixMap: Record<string, string> = {
                clientIdImage: 'client_id',
                clientWorkCard: 'client_workcard',
                salaryReport: 'salary_report',
                simaReport: 'sima_report',
                kafeelIdImage: 'kafeel', 
                kafeelWorkCard: 'kafeel_workcard',
            };

            const uploadedFiles = await this.mapUploadedFiles(files, newClient.nationalId, prefixMap);


            if (uploadedFiles.clientIdImage?.length) {
                await tx.clientDocument.create({
                    data: {
                        clientId: newClient.id,
                        clientIdImage: uploadedFiles.clientIdImage[0],
                        clientWorkCard: uploadedFiles.clientWorkCard?.[0] ?? null,
                        salaryReport: uploadedFiles.salaryReport?.[0] ?? null,
                        simaReport: uploadedFiles.simaReport?.[0] ?? null,
                    },
                });
            }


            if (Array.isArray(kafeelList) && kafeelList.length > 0) {
                for (let i = 0; i < kafeelList.length; i++) {
                    const k = kafeelList[i];

                    const kafeelIdImage = uploadedFiles.kafeelIdImage?.[i] ?? null;
                    const kafeelWorkCard = uploadedFiles.kafeelWorkCard?.[i] ?? null;

                    await tx.kafeel.create({
                        data: {
                            clientId: newClient.id,
                            name: k.name,
                            nationalId: k.nationalId,
                            birthDate: k.birthDate ? new Date(k.birthDate) : undefined,
                            city: k.city,
                            district: k.district,
                            employer: k.employer,
                            salary: k.salary,
                            obligations: k.obligations,
                            phone: k.phone,
                            email: k.email && k.email.trim() !== '' ? k.email : null,
                            kafeelIdImage,
                            kafeelWorkCard,
                        },
                    });
                }
            }

            return newClient;
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أضاف عميل جديد: ${client.name}`,
            },
        });

        return { message: 'تم اضافة عميل جديد', client };
    }


    private async mapUploadedFiles(
        files: Record<string, Express.Multer.File[]> | undefined,
        clientId: string,
        prefixMap: Record<string, string>,
    ) {
        if (!files) return {};

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', clientId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const fileMap: Record<string, string[]> = {};

        for (const [key, fileArray] of Object.entries(files)) {
            const prefix = prefixMap[key] ?? key;
            fileMap[key] = [];


            const existingFiles = fs.existsSync(uploadDir)
                ? fs.readdirSync(uploadDir).filter(f => f.startsWith(prefix))
                : [];


            const existingIndices = existingFiles.map(f => {
                const match = f.match(new RegExp(`${prefix}_(\\d+)`));
                return match ? parseInt(match[1], 10) : 0;
            });

            let nextIndex = 1;
            const getNextIndex = () => {
                while (existingIndices.includes(nextIndex)) nextIndex++;
                existingIndices.push(nextIndex); 
                return nextIndex++;
            };


            for (const file of fileArray) {
                const ext = path.extname(file.originalname);
                const filename = `${prefix}_${getNextIndex()}${ext}`;
                const filePath = path.join(uploadDir, filename);

                fs.writeFileSync(filePath, file.buffer);

                const publicPath = `${process.env.URL}uploads/clients/${clientId}/${filename}`;
                fileMap[key].push(publicPath);
            }
        }

        return fileMap;
    }


    private cleanDocumentData(data: Record<string, any>) {
        if (!data) return null;
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null && value !== '') {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }


    async updateClientData(currentUser: number, id: number, dto: UpdateClientDto) {
        const client = await this.prisma.client.findUnique({ where: { id } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const updateData: any = { ...dto };


        if (dto.birthDate) updateData.birthDate = new Date(dto.birthDate);
        if (dto.salary) updateData.salary = Number(dto.salary);
        if (dto.obligations) updateData.obligations = Number(dto.obligations);


        delete updateData.kafeel;
        delete updateData.documents;


        const updatedClient = await this.prisma.client.update({
            where: { id },
            data: updateData,
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث بيانات العميل: ${client.name}`,
            },
        });

        return { message: 'تم تحديث بيانات العميل بنجاح', client: updatedClient };
    }


    async updateKafeelData(
        currentUser: number,
        kafeelId: number,
        dto: Partial<KafeelDto> | UpdateKafeelDto,
        files?: Record<string, Express.Multer.File[]>,
    ) {

        const kafeel = await this.prisma.kafeel.findUnique({
            where: { id: kafeelId },
            include: { client: true },
        });
        if (!kafeel) throw new NotFoundException('Kafeel not found');


        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        let uploadedFiles: Record<string, string[]> = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap: Record<string, string> = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };

            uploadedFiles = await this.mapUploadedFiles(
                files,
                kafeel.client.nationalId, 
                prefixMap
            );
        }


        const updateData: any = {
            ...dto,
            salary: dto.salary !== undefined ? Number(dto.salary) : undefined,
            obligations: dto.obligations !== undefined ? Number(dto.obligations) : undefined,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            kafeelIdImage: uploadedFiles.kafeelIdImage?.[0] ?? dto.kafeelIdImage ?? kafeel.kafeelIdImage,
            kafeelWorkCard: uploadedFiles.kafeelWorkCard?.[0] ?? dto.kafeelWorkCard ?? kafeel.kafeelWorkCard,
        };


        Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);


        const updatedKafeel = await this.prisma.kafeel.update({
            where: { id: kafeelId },
            data: updateData,
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث بيانات الكفيل: ${kafeel.name}`,
            },
        });

        return { message: 'تم تحديث بيانات الكفيل بنجاح', kafeel: updatedKafeel };
    }


    async updateClientDocuments(
        currentUser: number,
        clientId: number,
        files?: Record<string, Express.Multer.File[]>,
        deleteFields?: string[],
    ) {

        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        let uploadedFiles: Record<string, string[]> = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap: Record<string, string> = {
                clientIdImage: 'client_id',
                clientWorkCard: 'client_workcard',
                salaryReport: 'salary_report',
                simaReport: 'sima_report',
            };
            uploadedFiles = await this.mapUploadedFiles(files, client.nationalId, prefixMap);
        }


        const docData = this.cleanDocumentData(
            Object.fromEntries(
                Object.entries(uploadedFiles).map(([k, v]) => [k, v[0]]) 
            )
        );


        const existingDocs = await this.prisma.clientDocument.findFirst({ where: { clientId } });


        const deleteFile = (fileUrl?: string) => {
            if (!fileUrl) return;
            try {
                const relativePath = decodeURI(fileUrl.replace(process.env.URL || '', ''));
                const fullPath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (err) {
                console.warn('⚠️ Could not delete old file:', err.message);
            }
        };

        const updateData: Record<string, string | null> = {};

        if (existingDocs) {

            if (deleteFields?.length) {
                for (const field of deleteFields) {
                    const oldUrl = (existingDocs as any)[field];
                    if (oldUrl) deleteFile(oldUrl);
                    updateData[field] = null;
                }
            }


            for (const key of Object.keys(docData || {})) {
                const newUrl = (docData as any)[key];
                const oldUrl = (existingDocs as any)[key];

                if (oldUrl && newUrl && oldUrl !== newUrl) deleteFile(oldUrl);

                updateData[key] = newUrl ?? null;
            }


            await this.prisma.clientDocument.update({
                where: { id: existingDocs.id },
                data: updateData,
            });
        } else {

            if (!docData?.clientIdImage) {
                throw new BadRequestException('clientIdImage is required');
            }

            await this.prisma.clientDocument.create({
                data: {
                    clientId,
                    clientIdImage: docData.clientIdImage,
                    clientWorkCard: docData.clientWorkCard ?? undefined,
                    salaryReport: docData.salaryReport ?? undefined,
                    simaReport: docData.simaReport ?? undefined,
                },
            });
        }


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث مستندات العميل: ${client.name}`,
            },
        });

        return { message: 'تم تحديث مستندات العميل بنجاح' };
    }


    async deleteClient(currentUser: number, clientId: number) {
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            include: { kafeelS: true },
        });
        if (!client) throw new NotFoundException('Client not found');

        const loanCount = await this.prisma.loan.count({
            where: {
                clientId,
            },
        });

        if (loanCount > 0) {
            throw new BadRequestException('لا يمكن حذف العميل لأنه لديه سلف غير مكتملة');
        }

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        await this.prisma.$transaction(async (tx) => {
            await tx.clientDocument.deleteMany({ where: { clientId } });

            if (client.kafeelS && client.kafeelS.length > 0) {
                const kafeelIds = client.kafeelS.map((k) => k.id);
                await tx.kafeel.deleteMany({ where: { id: { in: kafeelIds } } });
            }

            await tx.client.delete({ where: { id: clientId } });
        });

        try {
            const clientDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId || 'unknown');
            if (fs.existsSync(clientDir)) {
                fs.rmSync(clientDir, { recursive: true, force: true });
            } else {
                console.warn(`⚠️ Folder not found for client: ${clientDir}`);
            }
        } catch (err) {
            console.warn('⚠️ Failed to delete client folder:', (err as Error).message);
        }

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف العميل: ${client.name}`,
            },
        });

        return { message: `تم حذف العميل ${client.name} بنجاح` }
    }


    async getClients(
        page: number = 1,
        filters?: {
            limit?: number;
            name?: string;
            phone?: string;
            nationalId?: string;
            city?: string;
            status?: string;
        },
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.phone) where.phone = { contains: filters.phone, mode: 'insensitive' };
        if (filters?.nationalId) where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.city) where.city = { contains: filters.city, mode: 'insensitive' };
        if (filters?.status) where.status = filters.status;

        const totalClients = await this.prisma.client.count({ where });
        const totalPages = Math.ceil(totalClients / limit);

        if (page > totalPages && totalClients > 0) throw new NotFoundException('Page not found');

        const clients = await this.prisma.client.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'desc' },
            include: {
                kafeelS: true,       
                documents: true,     
            },
        });

        const formatted = clients.map((c) => ({
            client: {
                id: c.id,
                name: c.name,
                phone: c.phone,
                nationalId: c.nationalId,
                city: c.city,
                district: c.district,
                employer: c.employer,
                salary: c.salary,
                obligations: c.obligations,
                status: c.status,
                notes: c.notes,
                createdAt: c.createdAt,
            },
            kafeels: c.kafeelS || [],
            documents: c.documents || null,
        }));

        return {
            totalClients,
            totalPages,
            currentPage: page,
            limit,
            clients: formatted,
        };
    }


    async getClientById(id: number) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: {
                kafeelS: true,
                documents: true,
                loans: true,
            },
        });

        if (!client) throw new NotFoundException('Client not found');
        const documents = [
            ...client.documents.map(doc => ({
                clientIdImage: doc.clientIdImage,
                clientWorkCard: doc.clientWorkCard,
                salaryReport: doc.salaryReport || undefined,
                simaReport: doc.simaReport || undefined,
            })),
            ...client.loans.flatMap(loan => [
                loan.DEBT_ACKNOWLEDGMENT ? { DEBT_ACKNOWLEDGMENT: loan.DEBT_ACKNOWLEDGMENT, loanId: loan.id } : null,
                loan.PROMISSORY_NOTE ? { PROMISSORY_NOTE: loan.PROMISSORY_NOTE, loanId: loan.id } : null,
                loan.SETTLEMENT ? { SETTLEMENT: loan.SETTLEMENT, loanId: loan.id } : null,
            ].filter(Boolean)),
        ];

        return {
            client: {
                id: client.id,
                name: client.name,
                phone: client.phone,
                email: client.email,
                birthDate: client.birthDate,
                address: client.address,
                creationReason: client.creationReason,
                nationalId: client.nationalId,
                city: client.city,
                district: client.district,
                employer: client.employer,
                salary: client.salary,
                obligations: client.obligations,
                status: client.status,
                notes: client.notes,
                createdAt: client.createdAt,
            },
            kafeels: client.kafeelS || [],
            documents,
        };
    }

    async getClientStatement(
        clientId: number,
        page: number,
        options: { limit?: number; from?: string; to?: string } = {},
    ) {
        const { limit = 10, from, to } = options;

        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            select: {
                id: true,
                name: true,
                nationalId: true,
                balance: true,
                debit: true,
                credit: true,
            },
        });

        if (!client) throw new NotFoundException('Client not found');

        const toSaudiDate = (date: Date | string) =>
            DateTime.fromJSDate(new Date(date))
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-LL-dd HH:mm:ss');

        const dateFilter: any = {};
        if (from) dateFilter.gte = new Date(from);
        if (to) dateFilter.lte = new Date(to);


        const journals = await this.prisma.journalHeader.findMany({
            where: {
                OR: [
                    { lines: { some: { clientId } } },
                ],
                ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
            },
            include: {
                lines: { where: { clientId }, select: { debit: true, credit: true } },
                postedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });


        let runningBalance = 0;
        const transactions = journals.map((j) => {
            const totalDebit = j.lines.reduce((sum, l) => sum + l.debit, 0);
            const totalCredit = j.lines.reduce((sum, l) => sum + l.credit, 0);
            runningBalance += totalDebit - totalCredit;

            return {
                id: j.id,
                reference: j.reference,
                description: j.description,
                date: toSaudiDate(j.createdAt),
                type: j.type,
                status: j.status,
                debit: totalDebit,
                credit: totalCredit,
                balance: runningBalance,
                postedBy: j.postedBy,
            };
        });


        const startIndex = (page - 1) * limit;
        const paginatedTransactions = transactions.slice(startIndex, startIndex + limit);

        return {
            currentPage: page,
            totalTransactions: transactions.length,
            client,
            transactions: paginatedTransactions,
        };
    }

    async createKafeel(
        currentUser: number,
        clientId: number,
        dto: KafeelDto,
        files?: Record<string, Express.Multer.File[]>,
    ) {

        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        let uploadedFiles: Record<string, string[]> = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap: Record<string, string> = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };
            uploadedFiles = await this.mapUploadedFiles(files, client.nationalId, prefixMap);
        }


        const kafeelData: any = {
            clientId: client.id,
            name: dto.name,
            nationalId: dto.nationalId,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            city: dto.city,
            district: dto.district,
            employer: dto.employer,
            salary: dto.salary !== undefined ? Number(dto.salary) : undefined,
            obligations: dto.obligations !== undefined ? Number(dto.obligations) : undefined,
            phone: dto.phone,
            email: dto.email && dto.email.trim() !== '' ? dto.email : null,
            kafeelIdImage: uploadedFiles.kafeelIdImage?.[0] ?? dto.kafeelIdImage,
            kafeelWorkCard: uploadedFiles.kafeelWorkCard?.[0] ?? dto.kafeelWorkCard,
        };


        Object.keys(kafeelData).forEach((key) => kafeelData[key] === undefined && delete kafeelData[key]);


        const newKafeel = await this.prisma.kafeel.create({ data: kafeelData });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أضاف كفيل جديد للعميل: ${client.name}`,
            },
        });

        return { message: 'تم اضافة كفيل جديد', kafeel: newKafeel };
    }


    async deleteKafeel(currentUser: number, kafeelId: number) {

        const kafeel = await this.prisma.kafeel.findUnique({
            where: { id: kafeelId },
            include: {
                client: true,
                loans: true, 
            },
        });
        if (!kafeel) throw new NotFoundException('Kafeel not found');


        const hasActiveOrPendingLoans = kafeel.loans.some(
            (loan) => loan.status === 'ACTIVE' || loan.status === 'PENDING',
        );

        if (hasActiveOrPendingLoans) {
            throw new BadRequestException(
                `لا يمكن حذف الكفيل ${kafeel.name} لارتباطه بسلف نشطة أو قيد الانتظار.`,
            );
        }


        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        const deleteFile = (fileUrl?: string | null) => {
            if (!fileUrl) return;
            try {
                const relativePath = decodeURI(fileUrl.replace(process.env.URL || '', ''));
                const fullPath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            } catch (err) {
                console.warn('⚠️ Could not delete kafeel file:', (err as Error).message);
            }
        };


        deleteFile(kafeel.kafeelIdImage);
        deleteFile(kafeel.kafeelWorkCard);


        await this.prisma.kafeel.delete({ where: { id: kafeelId } });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف الكفيل: ${kafeel.name} للعميل ${kafeel.client.name}`,
            },
        });

        return { message: 'تم حذف الكفيل بنجاح' };
    }
}