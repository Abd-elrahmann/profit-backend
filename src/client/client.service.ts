import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import * as fs from 'fs';
import * as path from 'path';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Injectable()
export class ClientService {
    constructor(private prisma: PrismaService) { }

    //  CREATE CLIENT 
    async createClient(
        dto: CreateClientDto,
        files?: Record<string, Array<Express.Multer.File>>,
    ) {
        const exists = await this.prisma.client.findFirst({
            where: { OR: [{ phone: dto.phone }, { nationalId: dto.nationalId }] },
        });
        if (exists) throw new BadRequestException('Client already exists');

        const client = await this.prisma.$transaction(async (tx) => {
            // ✅ Create kafeel if provided
            let kafeelRecord: { id: number } | null = null;
            if (dto.kafeel) {
                const kafeelData = {
                    ...dto.kafeel,
                    birthDate: dto.kafeel.birthDate
                        ? new Date(dto.kafeel.birthDate)
                        : new Date(),
                    name: dto.kafeel.name ?? 'N/A',
                    nationalId: dto.kafeel.nationalId ?? 'N/A',
                    city: dto.kafeel.city ?? 'N/A',
                    district: dto.kafeel.district ?? 'N/A',
                    employer: dto.kafeel.employer ?? 'N/A',
                    salary: dto.kafeel.salary ?? 0,
                    obligations: dto.kafeel.obligations ?? 0,
                    phone: dto.kafeel.phone ?? 'N/A',
                    email: dto.kafeel.email ?? null,
                };

                kafeelRecord = await tx.kafeel.create({
                    data: kafeelData,
                    select: { id: true },
                });
            }

            // ✅ Create client
            const { kafeel: _kafeel, documents: _docs, ...clientData } = dto;
            const newClient = await tx.client.create({
                data: {
                    ...clientData,
                    birthDate: new Date(dto.birthDate),
                    kafeel: kafeelRecord
                        ? { connect: { id: kafeelRecord.id } }
                        : undefined,
                },
                select: { id: true, name: true, nationalId: true },
            });

            // ✅ Handle uploaded files
            const documents = await this.mapUploadedFiles(files, newClient.nationalId);
            const docData = this.cleanDocumentData(documents);
            if (docData && docData.clientIdImage) {
                await tx.clientDocument.create({
                    data: {
                        clientId: newClient.id,
                        clientIdImage: docData.clientIdImage,
                        clientWorkCard: docData.clientWorkCard ?? null,
                        salaryReport: docData.salaryReport ?? null,
                        simaReport: docData.simaReport ?? null,
                        kafeelIdImage: docData.kafeelIdImage ?? null,
                        kafeelWorkCard: docData.kafeelWorkCard ?? null,
                    },
                });
            }

            return newClient;
        });

        return { message: 'Client created successfully', client };
    }

    //  UPDATE CLIENT DATA 
    async updateClientData(id: number, dto: UpdateClientDto) {
        const client = await this.prisma.client.findUnique({ where: { id } });
        if (!client) throw new NotFoundException('Client not found');

        const updateData: any = { ...dto };
        if (dto.birthDate) updateData.birthDate = new Date(dto.birthDate);
        if (dto.salary) updateData.salary = Number(dto.salary);
        if (dto.obligations) updateData.obligations = Number(dto.obligations);

        delete updateData.kafeel;
        delete updateData.documents;

        await this.prisma.client.update({
            where: { id },
            data: updateData,
        });

        return { message: 'Client data updated successfully' };
    }

    //  UPDATE KAFEEL DATA 
    async updateKafeelData(id: number, dto: any) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: { kafeel: true },
        });
        if (!client) throw new NotFoundException('Client not found');

        const kafeelData = {
            name: dto.name ?? client.kafeel?.name ?? 'N/A',
            nationalId: dto.nationalId ?? client.kafeel?.nationalId ?? 'N/A',
            birthDate: dto.birthDate
                ? new Date(dto.birthDate)
                : client.kafeel?.birthDate ?? new Date(),
            city: dto.city ?? client.kafeel?.city ?? 'N/A',
            district: dto.district ?? client.kafeel?.district ?? 'N/A',
            employer: dto.employer ?? client.kafeel?.employer ?? 'N/A',
            salary: dto.salary ? Number(dto.salary) : client.kafeel?.salary ?? 0,
            obligations: dto.obligations
                ? Number(dto.obligations)
                : client.kafeel?.obligations ?? 0,
            phone: dto.phone ?? client.kafeel?.phone ?? 'N/A',
            email: dto.email ?? client.kafeel?.email ?? null,
        };

        if (client.kafeelId) {
            await this.prisma.kafeel.update({
                where: { id: client.kafeelId },
                data: kafeelData,
            });
        } else {
            const newKafeel = await this.prisma.kafeel.create({
                data: kafeelData,
                select: { id: true },
            });
            await this.prisma.client.update({
                where: { id },
                data: { kafeelId: newKafeel.id },
            });
        }

        return { message: 'Kafeel data updated successfully' };
    }

    //  UPDATE CLIENT DOCUMENTS 
    async updateClientDocuments(
        id: number,
        files?: Record<string, Array<Express.Multer.File>>,
        deleteFields?: string[],
    ) {
        const client = await this.prisma.client.findUnique({ where: { id } });
        if (!client) throw new NotFoundException('Client not found');

        const documents = await this.mapUploadedFiles(files, client.nationalId);
        const docData = this.cleanDocumentData(documents);

        const existingDocs = await this.prisma.clientDocument.findFirst({
            where: { clientId: id },
        });

        // 🧹 Helper: safely delete a file if it exists
        const deleteFile = (fileUrl?: string) => {
            if (!fileUrl) return;
            try {
                const relativePath = decodeURI(fileUrl.replace('http://localhost:3000/', ''));
                const fullPath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (err) {
                console.warn('⚠️ Could not delete old file:', err.message);
            }
        };

        const updateData: Record<string, string | null> = {};

        if (existingDocs) {
            // Handle deletions
            if (deleteFields?.length) {
                for (const field of deleteFields) {
                    const oldUrl = (existingDocs as any)[field];
                    if (oldUrl) deleteFile(oldUrl);
                    updateData[field] = null;
                }
            }

            // Handle new uploads / replacements
            for (const key of Object.keys(docData || {})) {
                const newUrl = (docData as any)[key];
                const oldUrl = (existingDocs as any)[key];
                if (oldUrl && newUrl && oldUrl !== newUrl) deleteFile(oldUrl);
                updateData[key] = newUrl;
            }

            await this.prisma.clientDocument.update({
                where: { id: existingDocs.id },
                data: updateData,
            });
        } else {
            if (!docData?.clientIdImage)
                throw new BadRequestException('clientIdImage is required');

            await this.prisma.clientDocument.create({
                data: {
                    clientId: id,
                    clientIdImage: docData.clientIdImage,
                    clientWorkCard: docData.clientWorkCard ?? undefined,
                    salaryReport: docData.salaryReport ?? undefined,
                    simaReport: docData.simaReport ?? undefined,
                    kafeelIdImage: docData.kafeelIdImage ?? undefined,
                    kafeelWorkCard: docData.kafeelWorkCard ?? undefined,
                },
            });
        }

        return { message: 'Client documents updated successfully' };
    }

    //  DELETE CLIENT  
    async deleteClient(id: number) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: { kafeel: true },
        });
        if (!client) throw new NotFoundException('Client not found');

        await this.prisma.$transaction(async (tx) => {
            await tx.clientDocument.deleteMany({ where: { clientId: id } });
            await tx.loan.deleteMany({ where: { clientId: id } });
            await tx.client.delete({ where: { id } });

            if (client.kafeelId) {
                await tx.kafeel.delete({ where: { id: client.kafeelId } });
            }
        });

        try {
            const clientDir = path.join(
                process.cwd(),
                'uploads',
                'clients',
                client.nationalId || 'unknown',
            );

            if (fs.existsSync(clientDir)) {
                fs.rmSync(clientDir, { recursive: true, force: true });
                console.log(`🗑️ Deleted folder: ${clientDir}`);
            } else {
                console.warn(`⚠️ Folder not found for client: ${clientDir}`);
            }
        } catch (err) {
            console.warn('⚠️ Failed to delete client folder:', err.message);
        }

        return { message: 'Client and related data deleted successfully' };
    }

    //  GET CLIENTS 
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
        const limit =
            filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.phone)
            where.phone = { contains: filters.phone, mode: 'insensitive' };
        if (filters?.nationalId)
            where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.city)
            where.city = { contains: filters.city, mode: 'insensitive' };
        if (filters?.status) where.status = filters.status;

        const totalClients = await this.prisma.client.count({ where });
        const totalPages = Math.ceil(totalClients / limit);

        if (page > totalPages && totalClients > 0)
            throw new NotFoundException('Page not found');

        const clients = await this.prisma.client.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'desc' },
            include: {
                kafeel: true,
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
            kafeel: c.kafeel || null,
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

    //  GET CLIENT BY ID
    async getClientById(id: number) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: {
                kafeel: true,
                documents: true,
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
            kafeel: client.kafeel || null,
            documents: client.documents || null,
        };
    }

    //  Helpers 
    private async mapUploadedFiles(
        files?: Record<string, Array<Express.Multer.File>>,
        clientEmail?: string,
    ) {
        if (!files) return null;

        const clientDir = path.join('uploads', 'clients', clientEmail || 'unknown');
        if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });

        const moveFile = (file?: Express.Multer.File) => {
            if (!file) return undefined;
            const newPath = path.join(clientDir, path.basename(file.path));
            fs.renameSync(file.path, newPath);
            const relPath = newPath.replace(/\\/g, '/');
            return `http://localhost:3000/${encodeURI(relPath)}`;
        };

        return {
            clientIdImage: moveFile(files?.clientIdImage?.[0]),
            clientWorkCard: moveFile(files?.clientWorkCard?.[0]),
            salaryReport: moveFile(files?.salaryReport?.[0]),
            simaReport: moveFile(files?.simaReport?.[0]),
            kafeelIdImage: moveFile(files?.kafeelIdImage?.[0]),
            kafeelWorkCard: moveFile(files?.kafeelWorkCard?.[0]),
        };
    }

    private cleanDocumentData(
        doc?: Record<string, string | undefined | null> | null,
    ): Record<string, string> | null {
        if (!doc) return null;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(doc)) {
            if (v !== undefined && v !== null) out[k] = v as string;
        }
        return Object.keys(out).length ? out : null;
    }
}