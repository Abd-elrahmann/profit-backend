import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class CreatePartnerDto {
    @IsString()
    name: string;

    @IsString()
    nationalId: string;

    @IsString()
    address: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsNumber()
    orgProfitPercent: number;

    @IsNumber()
    capitalAmount: number;

    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;

    @IsOptional()
    @IsDateString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    mudarabahFileUrl?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    isNewPartner?: boolean;

    @IsOptional()
    @IsBoolean()
    joinDistribute?: boolean;
}

export class UpdatePartnerDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    nationalId?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsNumber()
    capitalAmount: number;

    @IsOptional()
    @IsNumber()
    orgProfitPercent?: number;

    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;

    @IsOptional()
    @IsDateString()
    createdAt?: string;

    @IsOptional()
    @IsString()
    mudarabahFileUrl?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsBoolean()
    joinDistribute?: boolean;
}