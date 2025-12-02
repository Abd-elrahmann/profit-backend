import { ClientStatus } from '@prisma/client';
export declare class KafeelDto {
    name: string;
    nationalId: string;
    birthDate: string;
    city: string;
    district: string;
    employer: string;
    salary: number;
    obligations: number;
    phone: string;
    email?: string;
    kafeelIdImage?: string;
    kafeelWorkCard?: string;
}
export declare class UpdateKafeelDto {
    name?: string;
    nationalId?: string;
    birthDate?: string;
    city?: string;
    district?: string;
    employer?: string;
    salary?: number;
    obligations?: number;
    phone?: string;
    email?: string;
    kafeelIdImage?: string;
    kafeelWorkCard?: string;
}
export declare class ClientDocumentDto {
    clientIdImage: string;
    clientWorkCard?: string;
    salaryReport?: string;
    simaReport?: string;
}
export declare class CreateClientDto {
    name: string;
    email?: string;
    phone: string;
    telegramChatId?: string;
    birthDate: string;
    address: string;
    nationalId: string;
    city: string;
    district: string;
    employer: string;
    salary: number;
    obligations: number;
    creationReason: string;
    debit?: number;
    credit?: number;
    balance?: number;
    status?: ClientStatus;
    notes?: string;
    kafeel?: KafeelDto[];
    documents?: ClientDocumentDto;
}
export declare class UpdateClientDto {
    name?: string;
    email?: string;
    phone?: string;
    telegramChatId?: string;
    birthDate?: string;
    address?: string;
    nationalId?: string;
    city?: string;
    district?: string;
    employer?: string;
    salary?: number;
    obligations?: number;
    creationReason?: string;
    debit?: number;
    credit?: number;
    balance?: number;
    status?: ClientStatus;
    notes?: string;
    kafeel?: KafeelDto[];
    documents?: ClientDocumentDto;
}
