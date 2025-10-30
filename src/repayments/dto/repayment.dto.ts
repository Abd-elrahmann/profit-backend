import { IsOptional, IsNumber, IsString, IsDateString } from 'class-validator';

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
}