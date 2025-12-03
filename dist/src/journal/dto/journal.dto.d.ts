import { JournalType, JournalStatus, JournalSourceType } from '@prisma/client';
export declare class JournalLineDto {
    accountId: number;
    debit?: number;
    credit?: number;
    description?: string;
    clientId?: number;
}
export declare class CreateJournalDto {
    reference?: string;
    description?: string;
    type?: JournalType;
    sourceType?: JournalSourceType;
    sourceId?: number;
    periodId?: number;
    lines: JournalLineDto[];
}
export declare class UpdateJournalDto {
    description?: string;
    type?: JournalType;
    status?: JournalStatus;
    lines?: JournalLineDto[];
}
