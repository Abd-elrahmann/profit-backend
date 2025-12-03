import { JournalService } from './journal.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
export declare class JournalController {
    private readonly journalService;
    constructor(journalService: JournalService);
    create(req: any, dto: CreateJournalDto): Promise<{
        message: string;
        journal: {
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                accountId: number;
                clientId: number | null;
                journalId: number;
            }[];
        } & {
            id: number;
            reference: string | null;
            description: string | null;
            date: Date;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            postedById: number | null;
            periodId: number | null;
            createdAt: Date;
        };
    }>;
    update(req: any, id: number, dto: UpdateJournalDto): Promise<{
        message: string;
        updated: {
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                accountId: number;
                clientId: number | null;
                journalId: number;
            }[];
        } & {
            id: number;
            reference: string | null;
            description: string | null;
            date: Date;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            postedById: number | null;
            periodId: number | null;
            createdAt: Date;
        };
    }>;
    delete(req: any, id: number): Promise<{
        message: string;
    }>;
    getAll(page: number, limit?: number, search?: string, status?: string, type?: string, reference?: string, description?: string, sourceType?: string, postedByName?: string, dateFrom?: string, dateTo?: string): Promise<{
        total: number;
        totalPages: number;
        currentPage: number;
        limit: number;
        journals: {
            date: string | null;
            createdAt: string | null;
            postedBy: {
                id: number;
                name: string;
                email: string;
            } | null;
            id: number;
            reference: string | null;
            description: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            postedById: number | null;
            periodId: number | null;
        }[];
    }>;
    getById(id: number): Promise<{
        totals: {
            totalDebit: number;
            totalCredit: number;
            totalBalance: number;
        };
        postedBy: {
            id: number;
            name: string;
            email: string;
        } | null;
        lines: ({
            client: {
                id: number;
                status: import("@prisma/client").$Enums.ClientStatus;
                createdAt: Date;
                name: string;
                debit: number;
                credit: number;
                balance: number;
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
                notes: string | null;
            } | null;
            account: {
                id: number;
                type: import("@prisma/client").$Enums.AccountType;
                createdAt: Date;
                name: string;
                debit: number;
                credit: number;
                balance: number;
                code: string;
                parentId: number | null;
                level: number;
                isActive: boolean;
                nature: import("@prisma/client").$Enums.AccountNature;
                accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            };
        } & {
            id: number;
            description: string | null;
            debit: number;
            credit: number;
            balance: number;
            accountId: number;
            clientId: number | null;
            journalId: number;
        })[];
        id: number;
        reference: string | null;
        description: string | null;
        date: Date;
        type: import("@prisma/client").$Enums.JournalType;
        status: import("@prisma/client").$Enums.JournalStatus;
        sourceId: number | null;
        sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
        postedById: number | null;
        periodId: number | null;
        createdAt: Date;
    }>;
    postJournal(id: number, req: any): Promise<{
        message: string;
        journalId: number;
    }>;
    unpostJournal(req: any, id: number): Promise<{
        message: string;
        journalId: number;
    }>;
}
