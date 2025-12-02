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
exports.ClientService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const client_1 = require("@prisma/client");
const luxon_1 = require("luxon");
let ClientService = class ClientService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createClient(currentUser, dto, files) {
        const exists = await this.prisma.client.findFirst({
            where: { OR: [{ phone: dto.phone }, { nationalId: dto.nationalId }] },
        });
        if (exists)
            throw new common_1.BadRequestException('العميل موجود مسبقاً');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const client = await this.prisma.$transaction(async (tx) => {
            const { kafeel: kafeelList, documents: docDto, ...clientData } = dto;
            const newClient = await tx.client.create({
                data: {
                    ...clientData,
                    birthDate: new Date(dto.birthDate),
                    status: dto.status ?? client_1.ClientStatus.نشط,
                },
                select: { id: true, name: true, nationalId: true },
            });
            const prefixMap = {
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
    async mapUploadedFiles(files, clientId, prefixMap) {
        if (!files)
            return {};
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', clientId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        const fileMap = {};
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
                while (existingIndices.includes(nextIndex))
                    nextIndex++;
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
    cleanDocumentData(data) {
        if (!data)
            return null;
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null && value !== '') {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
    async updateClientData(currentUser, id, dto) {
        const client = await this.prisma.client.findUnique({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const updateData = { ...dto };
        if (dto.birthDate)
            updateData.birthDate = new Date(dto.birthDate);
        if (dto.salary)
            updateData.salary = Number(dto.salary);
        if (dto.obligations)
            updateData.obligations = Number(dto.obligations);
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
    async updateKafeelData(currentUser, kafeelId, dto, files) {
        const kafeel = await this.prisma.kafeel.findUnique({
            where: { id: kafeelId },
            include: { client: true },
        });
        if (!kafeel)
            throw new common_1.NotFoundException('Kafeel not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        let uploadedFiles = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };
            uploadedFiles = await this.mapUploadedFiles(files, kafeel.client.nationalId, prefixMap);
        }
        const updateData = {
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
    async updateClientDocuments(currentUser, clientId, files, deleteFields) {
        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        let uploadedFiles = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap = {
                clientIdImage: 'client_id',
                clientWorkCard: 'client_workcard',
                salaryReport: 'salary_report',
                simaReport: 'sima_report',
            };
            uploadedFiles = await this.mapUploadedFiles(files, client.nationalId, prefixMap);
        }
        const docData = this.cleanDocumentData(Object.fromEntries(Object.entries(uploadedFiles).map(([k, v]) => [k, v[0]])));
        const existingDocs = await this.prisma.clientDocument.findFirst({ where: { clientId } });
        const deleteFile = (fileUrl) => {
            if (!fileUrl)
                return;
            try {
                const relativePath = decodeURI(fileUrl.replace(process.env.URL || '', ''));
                const fullPath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(fullPath))
                    fs.unlinkSync(fullPath);
            }
            catch (err) {
                console.warn('⚠️ Could not delete old file:', err.message);
            }
        };
        const updateData = {};
        if (existingDocs) {
            if (deleteFields?.length) {
                for (const field of deleteFields) {
                    const oldUrl = existingDocs[field];
                    if (oldUrl)
                        deleteFile(oldUrl);
                    updateData[field] = null;
                }
            }
            for (const key of Object.keys(docData || {})) {
                const newUrl = docData[key];
                const oldUrl = existingDocs[key];
                if (oldUrl && newUrl && oldUrl !== newUrl)
                    deleteFile(oldUrl);
                updateData[key] = newUrl ?? null;
            }
            await this.prisma.clientDocument.update({
                where: { id: existingDocs.id },
                data: updateData,
            });
        }
        else {
            if (!docData?.clientIdImage) {
                throw new common_1.BadRequestException('clientIdImage is required');
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
    async deleteClient(currentUser, clientId) {
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            include: { kafeelS: true },
        });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        await this.prisma.$transaction(async (tx) => {
            await tx.clientDocument.deleteMany({ where: { clientId } });
            await tx.loan.deleteMany({ where: { clientId } });
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
                console.log(`🗑️ Deleted folder: ${clientDir}`);
            }
            else {
                console.warn(`⚠️ Folder not found for client: ${clientDir}`);
            }
        }
        catch (err) {
            console.warn('⚠️ Failed to delete client folder:', err.message);
        }
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Clients',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف العميل: ${client.name}`,
            },
        });
        return { message: `تم حذف العميل ${client.name} بنجاح` };
    }
    async getClients(page = 1, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.phone)
            where.phone = { contains: filters.phone, mode: 'insensitive' };
        if (filters?.nationalId)
            where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.city)
            where.city = { contains: filters.city, mode: 'insensitive' };
        if (filters?.status)
            where.status = filters.status;
        const totalClients = await this.prisma.client.count({ where });
        const totalPages = Math.ceil(totalClients / limit);
        if (page > totalPages && totalClients > 0)
            throw new common_1.NotFoundException('Page not found');
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
    async getClientById(id) {
        const client = await this.prisma.client.findUnique({
            where: { id },
            include: {
                kafeelS: true,
                documents: true,
                loans: true,
            },
        });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
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
    async getClientStatement(id, page, options) {
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
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const toSaudiDate = (date) => luxon_1.DateTime.fromJSDate(new Date(date))
            .setZone('Asia/Riyadh')
            .toFormat('yyyy-LL-dd HH:mm:ss');
        const dateFilter = {};
        if (from) {
            const saudiFrom = luxon_1.DateTime.fromISO(from, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toJSDate();
            dateFilter.gte = saudiFrom;
        }
        if (to) {
            const saudiTo = luxon_1.DateTime.fromISO(to, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toJSDate();
            dateFilter.lte = saudiTo;
        }
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
        const transactions = [];
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
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    async createKafeel(currentUser, clientId, dto, files) {
        const client = await this.prisma.client.findUnique({ where: { id: clientId } });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        let uploadedFiles = {};
        if (files && Object.keys(files).length > 0) {
            const prefixMap = {
                kafeelIdImage: 'kafeel',
                kafeelWorkCard: 'kafeel_workcard',
            };
            uploadedFiles = await this.mapUploadedFiles(files, client.nationalId, prefixMap);
        }
        const kafeelData = {
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
    async deleteKafeel(currentUser, kafeelId) {
        const kafeel = await this.prisma.kafeel.findUnique({
            where: { id: kafeelId },
            include: {
                client: true,
                loans: true,
            },
        });
        if (!kafeel)
            throw new common_1.NotFoundException('Kafeel not found');
        const hasActiveOrPendingLoans = kafeel.loans.some((loan) => loan.status === 'ACTIVE' || loan.status === 'PENDING');
        if (hasActiveOrPendingLoans) {
            throw new common_1.BadRequestException(`لا يمكن حذف الكفيل ${kafeel.name} لارتباطه بسلف نشطة أو قيد الانتظار.`);
        }
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const deleteFile = (fileUrl) => {
            if (!fileUrl)
                return;
            try {
                const relativePath = decodeURI(fileUrl.replace(process.env.URL || '', ''));
                const fullPath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(`🗑️ Deleted file: ${fullPath}`);
                }
            }
            catch (err) {
                console.warn('⚠️ Could not delete kafeel file:', err.message);
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
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClientService);
//# sourceMappingURL=client.service.js.map