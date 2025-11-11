import { IsEnum, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateType } from '@prisma/client';

export class TemplateVariableDto {
  @IsString()
  name: string;

  @IsString()
  description: string;
}

export class UpsertTemplateDto {
  @IsEnum(TemplateType)
  name: TemplateType;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  styles?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];
}