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
    @IsString()
    mudarabahFileUrl?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
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
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsNumber()
    orgProfitPercent?: number;

    @IsOptional()
    @IsNumber()
    capitalAmount?: number;

    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;

    @IsOptional()
    @IsString()
    mudarabahFileUrl?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}