import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
export declare class JournalService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createJournal(dto: CreateJournalDto, userId?: number): Promise<{
        message: string;
        journal: {
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                clientId: number | null;
                accountId: number;
                journalId: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            postedById: number | null;
            reference: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        };
    }>;
    updateJournal(currentUser: any, id: number, dto: UpdateJournalDto): Promise<{
        message: string;
        updated: {
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                clientId: number | null;
                accountId: number;
                journalId: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            postedById: number | null;
            reference: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        };
    }>;
    deleteJournal(currentUser: any, id: number): Promise<{
        message: string;
    }>;
    getAllJournals(page: number | undefined, params: {
        limit?: number;
        search?: string;
        status?: string;
        type?: string;
        reference?: string;
        description?: string;
        sourceType?: string;
        postedByName?: string;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        total: number;
        totalPages: number;
        currentPage: number;
        limit: number;
        journals: {
            date: string | null;
            createdAt: string | null;
            postedBy: {
                id: number;
                email: string;
                name: string;
            } | null;
            id: number;
            description: string | null;
            postedById: number | null;
            reference: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        }[];
    }>;
    getJournalById(id: number): Promise<{
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
                debit: number;
                credit: number;
                balance: number;
                notes: string | null;
            } | null;
            account: {
                id: number;
                name: string;
                isActive: boolean;
                createdAt: Date;
                type: import("@prisma/client").$Enums.AccountType;
                debit: number;
                credit: number;
                balance: number;
                code: string;
                accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
                nature: import("@prisma/client").$Enums.AccountNature;
                parentId: number | null;
                level: number;
            };
        } & {
            id: number;
            description: string | null;
            debit: number;
            credit: number;
            balance: number;
            clientId: number | null;
            accountId: number;
            journalId: number;
        })[];
        id: number;
        createdAt: Date;
        description: string | null;
        date: Date;
        postedById: number | null;
        reference: string | null;
        type: import("@prisma/client").$Enums.JournalType;
        status: import("@prisma/client").$Enums.JournalStatus;
        sourceId: number | null;
        sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
        periodId: number | null;
    }>;
    postJournal(id: number, userId: number): Promise<{
        message: string;
        journalId: number;
    }>;
    unpostJournal(currentUser: any, id: number): Promise<{
        message: string;
        journalId: number;
    }>;
    private updateAccountHierarchy;
}
