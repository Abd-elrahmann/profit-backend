export declare class CreatePartnerDto {
    name: string;
    nationalId: string;
    address: string;
    city?: string;
    phone?: string;
    email?: string;
    orgProfitPercent: number;
    capitalAmount: number;
    contractSignedAt?: string;
    createdAt?: string;
    mudarabahFileUrl?: string;
    isActive?: boolean;
    isNewPartner?: boolean;
}
export declare class UpdatePartnerDto {
    name?: string;
    nationalId?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
    orgProfitPercent?: number;
    capitalAmount?: number;
    contractSignedAt?: string;
    createdAt?: string;
    mudarabahFileUrl?: string;
    isActive?: boolean;
    joinDistribute?: boolean;
}
