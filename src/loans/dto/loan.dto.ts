import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { LoanType, LoanStatus } from '@prisma/client';

export class CreateLoanDto {
    @IsNumber()
    clientId: number;

    @IsNumber()
    amount: number;

    @IsNumber()
    interestRate: number;

    @IsNumber()
    durationMonths: number;

    @IsEnum(LoanType)
    type: LoanType;

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsNumber()
    repaymentDay?: number;
}

export class UpdateLoanDto {
    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsNumber()
    interestRate?: number;

    @IsOptional()
    @IsNumber()
    durationMonths?: number;

    @IsOptional()
    @IsEnum(LoanStatus)
    status?: LoanStatus;
    
    @IsOptional()
    @IsEnum(LoanType)
    type: LoanType;

    @IsOptional()
    @IsNumber()
    repaymentDay?: number;
}