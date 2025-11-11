import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { LoanType, LoanStatus } from '@prisma/client';

export class CreateLoanDto {
    @IsNumber()
    clientId: number;

    @IsNumber()
    amount: number;

    @IsNumber()
    paymentAmount: number;
    
    @IsNumber()
    interestRate: number;

    @IsEnum(LoanType)
    type: LoanType;

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsNumber()
    repaymentDay?: number;

    @IsOptional()
    bankAccountId?: number;

    @IsOptional()
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
}