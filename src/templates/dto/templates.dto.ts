import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TemplateType } from '@prisma/client';

export class UpsertTemplateDto {
  @IsEnum(TemplateType)
  name: TemplateType; 

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  description?: string;
} 