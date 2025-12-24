import { AccountType, AccountNature, AccountBasicType } from '@prisma/client';
export declare class CreateAccountDto {
    name: string;
    code: string;
    type: AccountType;
    accountBasicType: AccountBasicType;
    nature: AccountNature;
    parentId?: number;
    level?: number;
    isActive?: boolean;
}
export declare class UpdateAccountDto {
    name?: string;
    type?: AccountType;
    accountBasicType?: AccountBasicType;
    nature?: AccountNature;
    parentId?: number;
    isActive?: boolean;
}
