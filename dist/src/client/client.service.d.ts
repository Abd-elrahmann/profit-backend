import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto, KafeelDto, UpdateKafeelDto } from './dto/client.dto';
export declare class ClientService {
    private prisma;
    constructor(prisma: PrismaService);
    createClient(currentUser: number, dto: CreateClientDto, files?: Record<string, Array<Express.Multer.File>>): Promise<{
        message: string;
        client: {
            id: number;
            name: string;
            nationalId: string;
        };
    }>;
    private mapUploadedFiles;
    private cleanDocumentData;
    updateClientData(currentUser: number, id: number, dto: UpdateClientDto): Promise<{
        message: string;
        client: {
            id: number;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            credit: number;
            debit: number;
            balance: number;
            status: import("@prisma/client").$Enums.ClientStatus;
            nationalId: string;
            birthDate: Date;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            telegramChatId: string | null;
            address: string;
            creationReason: string;
            notes: string | null;
        };
    }>;
    updateKafeelData(currentUser: number, kafeelId: number, dto: Partial<KafeelDto> | UpdateKafeelDto, files?: Record<string, Express.Multer.File[]>): Promise<{
        message: string;
        kafeel: {
            id: number;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            nationalId: string;
            birthDate: Date;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
            clientId: number;
        };
    }>;
    updateClientDocuments(currentUser: number, clientId: number, files?: Record<string, Express.Multer.File[]>, deleteFields?: string[]): Promise<{
        message: string;
    }>;
    deleteClient(currentUser: number, clientId: number): Promise<{
        message: string;
    }>;
    getClients(page?: number, filters?: {
        limit?: number;
        name?: string;
        phone?: string;
        nationalId?: string;
        city?: string;
        status?: string;
    }): Promise<{
        totalClients: number;
        totalPages: number;
        currentPage: number;
        limit: number;
        clients: {
            client: {
                id: number;
                name: string;
                phone: string;
                nationalId: string;
                city: string;
                district: string;
                employer: string;
                salary: number;
                obligations: number;
                status: import("@prisma/client").$Enums.ClientStatus;
                notes: string | null;
                createdAt: Date;
            };
            kafeels: {
                id: number;
                email: string | null;
                phone: string;
                name: string;
                createdAt: Date;
                nationalId: string;
                birthDate: Date;
                city: string;
                district: string;
                employer: string;
                salary: number;
                obligations: number;
                kafeelIdImage: string | null;
                kafeelWorkCard: string | null;
                clientId: number;
            }[];
            documents: {
                id: number;
                createdAt: Date;
                clientIdImage: string;
                clientWorkCard: string | null;
                salaryReport: string | null;
                simaReport: string | null;
                clientId: number;
            }[];
        }[];
    }>;
    getClientById(id: number): Promise<{
        client: {
            id: number;
            name: string;
            phone: string;
            email: string | null;
            birthDate: Date;
            address: string;
            creationReason: string;
            nationalId: string;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            status: import("@prisma/client").$Enums.ClientStatus;
            notes: string | null;
            createdAt: Date;
        };
        kafeels: {
            id: number;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            nationalId: string;
            birthDate: Date;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
            clientId: number;
        }[];
        documents: ({
            clientIdImage: string;
            clientWorkCard: string | null;
            salaryReport: string | undefined;
            simaReport: string | undefined;
        } | {
            DEBT_ACKNOWLEDGMENT: string;
            loanId: number;
            PROMISSORY_NOTE?: undefined;
            SETTLEMENT?: undefined;
        } | {
            PROMISSORY_NOTE: string;
            loanId: number;
            DEBT_ACKNOWLEDGMENT?: undefined;
            SETTLEMENT?: undefined;
        } | {
            SETTLEMENT: string;
            loanId: number;
            DEBT_ACKNOWLEDGMENT?: undefined;
            PROMISSORY_NOTE?: undefined;
        } | null)[];
    }>;
    getClientStatement(clientId: number, page: number, options?: {
        limit?: number;
        from?: string;
        to?: string;
    }): Promise<{
        currentPage: number;
        totalTransactions: number;
        client: {
            id: number;
            name: string;
            credit: number;
            debit: number;
            balance: number;
            nationalId: string;
        };
        transactions: {
            id: number;
            reference: string | null;
            description: string | null;
            date: string;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            debit: number;
            credit: number;
            balance: number;
            postedBy: {
                id: number;
                email: string;
                name: string;
            } | null;
        }[];
    }>;
    createKafeel(currentUser: number, clientId: number, dto: KafeelDto, files?: Record<string, Express.Multer.File[]>): Promise<{
        message: string;
        kafeel: {
            id: number;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            nationalId: string;
            birthDate: Date;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
            clientId: number;
        };
    }>;
    deleteKafeel(currentUser: number, kafeelId: number): Promise<{
        message: string;
    }>;
}
