import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { LoanType, LoanStatus } from '@prisma/client';

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
    interestRate: number;

    @IsOptional()
    @IsNumber()
    totalInterest: number;

    @IsEnum(LoanType)
    type: LoanType;

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsNumber()
    repaymentDay?: number;

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
    interestRate?: number;

    @IsOptional()
    @IsEnum(LoanStatus)
    status?: LoanStatus;

    @IsOptional()
    @IsEnum(LoanType)
    type: LoanType;

    @IsOptional()
    @IsNumber()
    repaymentDay?: number;

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
}