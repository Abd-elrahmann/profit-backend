import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class BulkPaymentProofDto {
  @IsString()
  @Transform(({ value }) => {
    try {

      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        throw new Error('installmentIds must be an array');
      }
      return parsed;
    } catch {
      throw new Error('installmentIds must be a valid JSON array');
    }
  })
  @IsArray()
  @IsNotEmpty()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  installmentIds: number[];

  @IsOptional()
  notes?: string;
}
