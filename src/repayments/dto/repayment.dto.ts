import { IsOptional, IsNumber, IsString, IsDateString, IsEnum } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RepaymentDto {
  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  postponeReason?: string;

  @IsOptional()
  @IsDateString()
  newDueDate?: string;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  BankId?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}