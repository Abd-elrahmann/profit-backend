import { LoanType, LoanStatus, LoanFundSource } from '@prisma/client';
export declare class CreateLoanDto {
    clientId: number;
    kafeelId?: number;
    amount: number;
    paymentAmount: number;
    InterestPercentage: number;
    TotalInterest: number;
    type: LoanType;
    source: LoanFundSource;
    startDate?: string;
    repaymentDay?: string;
    bankAccountId?: number;
    partnerId?: number;
    issuanceCity?: string;
    paymentCity?: string;
}
export declare class UpdateLoanDto {
    amount?: number;
    paymentAmount?: number;
    InterestPercentage?: number;
    TotalInterest: number;
    status?: LoanStatus;
    type: LoanType;
    source: LoanFundSource;
    repaymentDay?: string;
    bankAccountId?: number;
    partnerId?: number;
    clientId?: number;
    kafeelId?: number;
    startDate?: string;
    issuanceCity?: string;
    paymentCity?: string;
}
