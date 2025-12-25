import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { LoanType, LoanStatus, LoanFundSource } from '@prisma/client';

export class CreateLoanDto {
    @IsNumber()
    clientId: number;

    @IsOptional()
    @IsNumber()
    kafeelId?: number;

    @IsNumber()
    amount: number;

    @IsNumber()
    paymentAmount: number;

    @IsOptional()
    @IsNumber()
    InterestPercentage: number;

    @IsOptional()
    @IsNumber()
    TotalInterest: number;

    @IsEnum(LoanType)
    type: LoanType;

    @IsEnum(LoanFundSource)
    source: LoanFundSource;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    repaymentDay?: string;

    @IsNumber()
    bankAccountId?: number;

    @IsNumber()
    partnerId?: number;
}

export class UpdateLoanDto {
    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsNumber()
    paymentAmount?: number;

    @IsOptional()
    @IsNumber()
    InterestPercentage?: number;

    @IsOptional()
    @IsNumber()
    TotalInterest: number;

    @IsOptional()
    @IsEnum(LoanStatus)
    status?: LoanStatus;

    @IsOptional()
    @IsEnum(LoanType)
    type: LoanType;

    @IsOptional()
    @IsEnum(LoanFundSource)
    source: LoanFundSource;

    @IsOptional()
    @IsDateString()
    repaymentDay?: string;

    @IsOptional()
    @IsNumber()
    bankAccountId?: number;

    @IsOptional()
    @IsNumber()
    partnerId?: number;

    @IsOptional()
    @IsNumber()
    clientId?: number;

    @IsOptional()
    @IsNumber()
    kafeelId?: number;

    @IsOptional()
    @IsDateString()
    startDate?: string;
}