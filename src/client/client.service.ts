import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto, KafeelDto } from './dto/client.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
import { PaymentStatus, LoanStatus, ClientStatus } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class ClientService {
    constructor(private prisma: PrismaService) { }

    // CREATE CLIENT 
    async createClient(
        currentUser: number,
        dto: CreateClientDto,
        files?: Record<string, Array<Express.Multer.File>>,
    ) {
        // 1️⃣ Check if client exists
        const exists = await this.prisma.client.findFirst({
            where: { OR: [{ phone: dto.phone }, { nationalId: dto.nationalId }] },
        });
        if (exists) throw new BadRequestException('Client already exists');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // 2️⃣ Start transaction
        const client = await this.prisma.$transaction(async (tx) => {
            const { kafeel: kafeelList, documents: docDto, ...clientData } = dto;

            // 2a️⃣ Create Client
            const newClient = await tx.client.create({
                data: {
                    ...clientData,
                    birthDate: new Date(dto.birthDate),
                    status: dto.status ?? ClientStatus.نشط,
                },
                select: { id: true, name: true, nationalId: true },
            });

            // 2b️⃣ Map uploaded files with custom prefixes
            const prefixMap: Record<string, string> = {
                clientIdImage: 'client_id',
                clientWorkCard: 'client_workcard',
                salaryReport: 'salary_report',
                simaReport: 'sima_report',
                kafeelIdImage: 'kafeel', // will append 1,2,3
                kafeelWorkCard: 'kafeel_workcard',
            };

            const uploadedFiles = await this.mapUploadedFiles(files, newClient.nationalId, prefixMap);

            // 2c️⃣ Save client documents
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

            // 2d️⃣ Create Kafeels
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
                            birthDate: new Date(k.birthDate),
                            city: k.city,
                            district: k.district,
                            employer: k.employer,
                            salary: k.salary,
                            obligations: k.obligations,
                            phone: k.phone,
                            email: k.email ?? null,
                            kafeelIdImage,
                            kafeelWorkCard,
                        },
                    });
                }
            }

            return newClient;
        });

        // 3️⃣ Audit Log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أضاف عميل جديد: ${client.name}`,
            },
        });

        return { message: 'Client created successfully', client };
    }

    // Map uploaded files and rename with prefixes
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

            // Get existing files to determine the next available index
            const existingFiles = fs.existsSync(uploadDir)
                ? fs.readdirSync(uploadDir).filter(f => f.startsWith(prefix))
                : [];

            // Extract existing indices
            const existingIndices = existingFiles.map(f => {
                const match = f.match(new RegExp(`${prefix}_(\\d+)`));
                return match ? parseInt(match[1], 10) : 0;
            });

            let nextIndex = 1;
            const getNextIndex = () => {
                while (existingIndices.includes(nextIndex)) nextIndex++;
                existingIndices.push(nextIndex); // Reserve it
                return nextIndex++;
            };

            // Save each uploaded file
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

    // Clean document data
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

    // UPDATE CLIENT DATA 
    async updateClientData(currentUser: number, id: number, dto: UpdateClientDto) {
        const client = await this.prisma.client.findUnique({ where: { id } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const updateData: any = { ...dto };

        // Properly cast/update fields
        if (dto.birthDate) updateData.birthDate = new Date(dto.birthDate);
        if (dto.salary) updateData.salary = Number(dto.salary);
        if (dto.obligations) updateData.obligations = Number(dto.obligations);

        // Exclude kafeel and documents for now
        delete updateData.kafeel;
        delete updateData.documents;

        // Update client
        const updatedClient = await this.prisma.client.update({
            where: { id },
            data: updateData,
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث بيانات العميل: ${client.name}`,
            },
        });

        return { message: 'Client data updated successfully', client: updatedClient };
    }

    // UPDATE KAFEEL DATA 
    async updateKafeelData(
        currentUser: number,
        kafeelId: number,
        dto: Partial<KafeelDto>,
        files?: Record<string, Express.Multer.File[]>,
    ) {
        // 1️⃣ Fetch the kafeel including the client to get nationalId
        const kafeel = await this.prisma.kafeel.findUnique({
            where: { id: kafeelId },
            include: { client: true },
        });
        if (!kafeel) throw new NotFoundException('Kafeel not found');

        // 2️⃣ Fetch user for audit log
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // 3️⃣ Map uploaded files if any
        let uploadedFiles: Record<string, string[]> = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap: Record<string, string> = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };

            uploadedFiles = await this.mapUploadedFiles(
                files,
                kafeel.client.nationalId, // use national ID for folder
                prefixMap
            );
        }

        // 4️⃣ Prepare update data
        const updateData: any = {
            ...dto,
            salary: dto.salary !== undefined ? Number(dto.salary) : undefined,
            obligations: dto.obligations !== undefined ? Number(dto.obligations) : undefined,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            kafeelIdImage: uploadedFiles.kafeelIdImage?.[0] ?? dto.kafeelIdImage ?? kafeel.kafeelIdImage,
            kafeelWorkCard: uploadedFiles.kafeelWorkCard?.[0] ?? dto.kafeelWorkCard ?? kafeel.kafeelWorkCard,
        };

        // 5️⃣ Remove undefined fields to prevent Prisma errors
        Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

        // 6️⃣ Update kafeel
        const updatedKafeel = await this.prisma.kafeel.update({
            where: { id: kafeelId },
            data: updateData,
        });

        // 7️⃣ Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث بيانات الكفيل: ${kafeel.name}`,
            },
        });

        return { message: 'Kafeel data updated successfully', kafeel: updatedKafeel };
    }

    // UPDATE CLIENT DOCUMENTS
    async updateClientDocuments(
        currentUser: number,
        clientId: number,
        files?: Record<string, Express.Multer.File[]>,
        deleteFields?: string[],
    ) {
        // 1️⃣ Fetch client
        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // 2️⃣ Map uploaded files with prefixes
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

        // 3️⃣ Clean mapped files
        const docData = this.cleanDocumentData(
            Object.fromEntries(
                Object.entries(uploadedFiles).map(([k, v]) => [k, v[0]]) // take first file only
            )
        );

        // 4️⃣ Fetch existing documents
        const existingDocs = await this.prisma.clientDocument.findFirst({ where: { clientId } });

        // Helper: delete old file if exists
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
            // 5️⃣ Handle deletions
            if (deleteFields?.length) {
                for (const field of deleteFields) {
                    const oldUrl = (existingDocs as any)[field];
                    if (oldUrl) deleteFile(oldUrl);
                    updateData[field] = null;
                }
            }

            // 6️⃣ Handle new uploads
            for (const key of Object.keys(docData || {})) {
                const newUrl = (docData as any)[key];
                const oldUrl = (existingDocs as any)[key];

                if (oldUrl && newUrl && oldUrl !== newUrl) deleteFile(oldUrl);

                updateData[key] = newUrl ?? null;
            }

            // 7️⃣ Update Prisma
            await this.prisma.clientDocument.update({
                where: { id: existingDocs.id },
                data: updateData,
            });
        } else {
            // 8️⃣ Create new documents if not exist
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

        // 9️⃣ Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث مستندات العميل: ${client.name}`,
            },
        });

        return { message: 'Client documents updated successfully' };
    }

    // DELETE CLIENT
    async deleteClient(currentUser: number, clientId: number) {
        // 1️⃣ Fetch client with all related kafeels
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            include: { kafeelS: true }, // fetch all kafeels
        });
        if (!client) throw new NotFoundException('Client not found');

        // 2️⃣ Fetch user for audit log
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // 3️⃣ Transaction: delete related data
        await this.prisma.$transaction(async (tx) => {
            // Delete client documents
            await tx.clientDocument.deleteMany({ where: { clientId } });

            // Delete loans
            await tx.loan.deleteMany({ where: { clientId } });

            // Delete kafeels
            if (client.kafeelS && client.kafeelS.length > 0) {
                const kafeelIds = client.kafeelS.map((k) => k.id);
                await tx.kafeel.deleteMany({ where: { id: { in: kafeelIds } } });
            }

            // Delete client
            await tx.client.delete({ where: { id: clientId } });
        });

        // 4️⃣ Delete client folder from filesystem
        try {
            const clientDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId || 'unknown');
            if (fs.existsSync(clientDir)) {
                fs.rmSync(clientDir, { recursive: true, force: true });
                console.log(`🗑️ Deleted folder: ${clientDir}`);
            } else {
                console.warn(`⚠️ Folder not found for client: ${clientDir}`);
            }
        } catch (err) {
            console.warn('⚠️ Failed to delete client folder:', (err as Error).message);
        }

        // 5️⃣ Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف العميل: ${client.name}`,
            },
        });

        return { message: 'Client and all related data deleted successfully' };
    }

    // GET CLIENTS
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
                kafeelS: true,       // fetch all kafeels
                documents: true,     // fetch documents
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

    // GET CLIENT BY ID
    async getClientById(id: number) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: {
                kafeelS: true,    // fetch all kafeels for this client
                documents: true,  // fetch documents
            },
        });

        if (!client) throw new NotFoundException('Client not found');

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
            kafeels: client.kafeelS || [], // return array for consistency
            documents: client.documents || null,
        };
    }

    async getClientStatement(
        id: number,
        page: number,
        options: { from?: string; to?: string; limit?: number },
    ) {
        const { from, to, limit = 10 } = options;

        const client = await this.prisma.client.findUnique({
            where: { id },
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

        // Helper to convert and compare dates in Saudi timezone
        const toSaudiDate = (date: Date | string) =>
            DateTime.fromJSDate(new Date(date))
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-LL-dd HH:mm:ss');

        const dateFilter: any = {};
        if (from) {
            const saudiFrom = DateTime.fromISO(from, { zone: 'Asia/Riyadh' })
                .startOf('day') // start of that day (00:00:00)
                .toJSDate();
            dateFilter.gte = saudiFrom;
        }
        if (to) {
            const saudiTo = DateTime.fromISO(to, { zone: 'Asia/Riyadh' })
                .endOf('day') // end of that day (23:59:59)
                .toJSDate();
            dateFilter.lte = saudiTo;
        }

        // Get loans
        const loans = await this.prisma.loan.findMany({
            where: {
                clientId: id,
                ...(Object.keys(dateFilter).length ? { startDate: dateFilter } : {}),
            },
            select: {
                id: true,
                code: true,
                startDate: true,
                totalAmount: true,
                status: true,
                newAmount: true,
                createdAt: true,
            },
        });

        // Get repayments
        const repayments = await this.prisma.repayment.findMany({
            where: {
                clientId: id,
                ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}),
            },
            select: {
                id: true,
                paymentDate: true,
                amount: true,
                paidAmount: true,
                status: true,
            },
        });

        // Combine transactions
        const transactions: any[] = [];

        for (const loan of loans) {
            transactions.push({
                date: loan.createdAt,
                type: 'LOAN_DISBURSEMENT',
                description: `سلفة رقم ${loan.code}`,
                debit: loan.newAmount ? loan.newAmount : loan.totalAmount,
                credit: 0,
            });
        }

        for (const r of repayments) {
            if (['PAID', 'COMPLETED', 'PARTIAL_PAID', 'EARLY_PAID'].includes(r.status)) {
                transactions.push({
                    date: r.paymentDate,
                    type: r.status === 'EARLY_PAID' ? 'EARLY_PAYMENT' : 'REPAYMENT',
                    description: r.status === 'EARLY_PAID' ? 'سداد مبكر' : 'سداد دفعة',
                    debit: 0,
                    credit: r.paidAmount || r.amount,
                });
            }
        }

        // Sort by date ascending
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Compute running balance
        let runningBalance = client.debit - client.credit;
        let totalDebit = 0;
        let totalCredit = 0;

        const detailedTransactions = transactions.map((t) => {
            runningBalance += t.debit - t.credit;
            totalDebit += t.debit;
            totalCredit += t.credit;
            return {
                ...t,
                date: toSaudiDate(t.date),
                balance: runningBalance,
            };
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const paginatedTransactions = detailedTransactions.slice(startIndex, startIndex + limit);

        return {
            totalPages: Math.ceil(detailedTransactions.length / limit),
            currentPage: page,
            totalTransactions: detailedTransactions.length,
            client,
            openingBalance: client.debit - client.credit,
            transactions: paginatedTransactions,
            totalDebit,
            totalCredit,
            closingBalance: runningBalance,
        };
    }

    // CREATE NEW KAFEEL FOR A CLIENT
    async createKafeel(
        currentUser: number,
        clientId: number,
        dto: KafeelDto,
        files?: Record<string, Express.Multer.File[]>,
    ) {
        // 1️⃣ Fetch client
        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // 2️⃣ Map uploaded files with proper prefixes
        let uploadedFiles: Record<string, string[]> = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap: Record<string, string> = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };
            uploadedFiles = await this.mapUploadedFiles(files, client.nationalId, prefixMap);
        }

        // 3️⃣ Prepare data
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
            email: dto.email ?? null,
            kafeelIdImage: uploadedFiles.kafeelIdImage?.[0] ?? dto.kafeelIdImage,
            kafeelWorkCard: uploadedFiles.kafeelWorkCard?.[0] ?? dto.kafeelWorkCard,
        };

        // Remove undefined fields
        Object.keys(kafeelData).forEach((key) => kafeelData[key] === undefined && delete kafeelData[key]);

        // 4️⃣ Create Kafeel
        const newKafeel = await this.prisma.kafeel.create({ data: kafeelData });

        // 5️⃣ Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أضاف كفيل جديد للعميل: ${client.name}`,
            },
        });

        return { message: 'Kafeel created successfully', kafeel: newKafeel };
    }
}