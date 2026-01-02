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
                credit: number;
                debit: number;
                balance: number;
                clientId: number | null;
                journalId: number;
                accountId: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            type: import("@prisma/client").$Enums.JournalType;
            postedById: number | null;
            reference: string | null;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        };
    }>;
    update(req: any, id: number, dto: UpdateJournalDto): Promise<{
        message: string;
        updated: {
            lines: {
                id: number;
                description: string | null;
                credit: number;
                debit: number;
                balance: number;
                clientId: number | null;
                journalId: number;
                accountId: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            type: import("@prisma/client").$Enums.JournalType;
            postedById: number | null;
            reference: string | null;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
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
            dateHijri: any;
            createdAt: string | null;
            createdAtHijri: any;
            postedBy: {
                id: number;
                email: string;
                name: string;
            } | null;
            id: number;
            description: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            postedById: number | null;
            reference: string | null;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        }[];
    }>;
    checkUnpostedOpeningJournals(): Promise<{
        hasUnpostedOpeningJournals: boolean;
        unpostedOpeningJournals: {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            reference: string | null;
        }[];
        count: number;
    }>;
    getById(id: number): Promise<{
        totals: {
            totalDebit: number;
            totalCredit: number;
            totalBalance: number;
        };
        postedBy: {
            id: number;
            email: string;
            name: string;
        } | null;
        lines: ({
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
            } | null;
            account: {
                id: number;
                name: string;
                isActive: boolean;
                createdAt: Date;
                code: string;
                parentId: number | null;
                type: import("@prisma/client").$Enums.AccountType;
                level: number;
                credit: number;
                debit: number;
                balance: number;
                nature: import("@prisma/client").$Enums.AccountNature;
                accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            };
        } & {
            id: number;
            description: string | null;
            credit: number;
            debit: number;
            balance: number;
            clientId: number | null;
            journalId: number;
            accountId: number;
        })[];
        id: number;
        createdAt: Date;
        description: string | null;
        date: Date;
        type: import("@prisma/client").$Enums.JournalType;
        postedById: number | null;
        reference: string | null;
        status: import("@prisma/client").$Enums.JournalStatus;
        sourceId: number | null;
        sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
        periodId: number | null;
    }>;
    postJournal(id: number, req: any): Promise<{
        message: string;
        journalId: number;
    }>;
    unpostJournal(req: any, id: number): Promise<{
        message: string;
        journalId: number;
    }>;
    postMultiple(ids: number[], req: any): Promise<any[]>;
    unpostMultiple(ids: number[], req: any): Promise<any[]>;
}
