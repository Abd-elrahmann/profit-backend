import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
export declare class JournalService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private toHijri;
    createJournal(dto: CreateJournalDto, userId?: number): Promise<{
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
    updateJournal(currentUser: any, id: number, dto: UpdateJournalDto): Promise<{
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
    postJournal(id: number, userId: number): Promise<{
        message: string;
        journalId: number;
    }>;
    unpostJournal(currentUser: any, id: number): Promise<{
        message: string;
        journalId: number;
    }>;
    private updateAccountHierarchy;
    postMultipleJournals(ids: number[], userId: number): Promise<any[]>;
    unpostMultipleJournals(ids: number[], userId: number): Promise<any[]>;
}
