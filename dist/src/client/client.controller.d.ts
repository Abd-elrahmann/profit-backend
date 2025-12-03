import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto, KafeelDto, UpdateKafeelDto } from './dto/client.dto';
export declare class ClientController {
    private readonly clientService;
    constructor(clientService: ClientService);
    createClient(req: any, dto: CreateClientDto, files: Record<string, Express.Multer.File[]>): Promise<{
        message: string;
        client: {
            name: string;
            nationalId: string;
            id: number;
        };
    }>;
    updateClientData(req: any, id: number, dto: UpdateClientDto): Promise<{
        message: string;
        client: {
            name: string;
            email: string | null;
            phone: string;
            telegramChatId: string | null;
            birthDate: Date;
            address: string;
            nationalId: string;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            creationReason: string;
            debit: number;
            credit: number;
            balance: number;
            status: import("@prisma/client").$Enums.ClientStatus;
            notes: string | null;
            createdAt: Date;
            id: number;
        };
    }>;
    updateKafeelData(req: any, kafeelId: number, dto: UpdateKafeelDto, files?: {
        kafeelIdImage?: Express.Multer.File[];
        kafeelWorkCard?: Express.Multer.File[];
    }): Promise<{
        message: string;
        kafeel: {
            name: string;
            email: string | null;
            phone: string;
            birthDate: Date;
            nationalId: string;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            createdAt: Date;
            id: number;
            clientId: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
        };
    }>;
    updateClientDocuments(req: any, id: number, files: Record<string, Array<Express.Multer.File>>, deleteFields?: string | string[]): Promise<{
        message: string;
    }>;
    deleteClient(req: any, id: number): Promise<{
        message: string;
    }>;
    getClients(page: number, limit?: number, name?: string, phone?: string, nationalId?: string, city?: string, status?: string): Promise<{
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
                name: string;
                email: string | null;
                phone: string;
                birthDate: Date;
                nationalId: string;
                city: string;
                district: string;
                employer: string;
                salary: number;
                obligations: number;
                createdAt: Date;
                id: number;
                clientId: number;
                kafeelIdImage: string | null;
                kafeelWorkCard: string | null;
            }[];
            documents: {
                createdAt: Date;
                id: number;
                clientId: number;
                clientIdImage: string;
                clientWorkCard: string | null;
                salaryReport: string | null;
                simaReport: string | null;
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
            name: string;
            email: string | null;
            phone: string;
            birthDate: Date;
            nationalId: string;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            createdAt: Date;
            id: number;
            clientId: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
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
    getClientStatement(id: number, page: number, limit?: number, from?: string, to?: string): Promise<{
        totalPages: number;
        currentPage: number;
        totalTransactions: number;
        client: {
            name: string;
            nationalId: string;
            debit: number;
            credit: number;
            balance: number;
            id: number;
        };
        openingBalance: number;
        transactions: any[];
        totalDebit: number;
        totalCredit: number;
        closingBalance: number;
    }>;
    createKafeel(req: any, clientId: number, dto: KafeelDto, files?: Record<string, Express.Multer.File[]>): Promise<{
        message: string;
        kafeel: {
            name: string;
            email: string | null;
            phone: string;
            birthDate: Date;
            nationalId: string;
            city: string;
            district: string;
            employer: string;
            salary: number;
            obligations: number;
            createdAt: Date;
            id: number;
            clientId: number;
            kafeelIdImage: string | null;
            kafeelWorkCard: string | null;
        };
    }>;
    deleteKafeel(req: any, kafeelId: number): Promise<{
        message: string;
    }>;
}
