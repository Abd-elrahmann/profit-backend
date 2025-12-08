import { LoanType, LoanStatus } from '@prisma/client';
export declare class CreateLoanDto {
    clientId: number;
    kafeelId?: number;
    amount: number;
    paymentAmount: number;
    InterestPercentage: number;
    TotalInterest: number;
    type: LoanType;
    startDate?: string;
    repaymentDay?: number;
    bankAccountId?: number;
    partnerId?: number;
}
export declare class UpdateLoanDto {
    amount?: number;
    paymentAmount?: number;
    InterestPercentage?: number;
    TotalInterest: number;
    status?: LoanStatus;
    type: LoanType;
    repaymentDay?: number;
    bankAccountId?: number;
    partnerId?: number;
    clientId?: number;
    kafeelId?: number;
    startDate?: string;
}
