import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientStatus } from '@prisma/client';

export class KafeelDto {
  @IsString()
  name: string;

  @IsString()
  nationalId: string;

  @IsDateString()
  birthDate: string;

  @IsString()
  city: string;

  @IsString()
  district: string;

  @IsString()
  employer: string;

  @IsNumber()
  @Type(() => Number)
  salary: number;

  @IsNumber()
  @Type(() => Number)
  obligations: number;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  kafeelIdImage?: string;

  @IsOptional()
  @IsString()
  kafeelWorkCard?: string;
}

export class ClientDocumentDto {
  @IsString()
  clientIdImage: string;

  @IsOptional()
  @IsString()
  clientWorkCard?: string;

  @IsOptional()
  @IsString()
  salaryReport?: string;

  @IsOptional()
  @IsString()
  simaReport?: string;
}

export class CreateClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsDateString()
  birthDate: string;

  @IsString()
  address: string;

  @IsString()
  nationalId: string;

  @IsString()
  city: string;

  @IsString()
  district: string;

  @IsString()
  employer: string;

  @IsNumber()
  @Type(() => Number)
  salary: number;

  @IsNumber()
  @Type(() => Number)
  obligations: number;

  @IsString()
  creationReason: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KafeelDto)
  kafeel?: KafeelDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientDocumentDto)
  documents?: ClientDocumentDto;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  employer?: string;

  @IsOptional()
  @IsNumber()
  salary?: number;

  @IsOptional()
  @IsNumber()
  obligations?: number;

  @IsOptional()
  @IsString()
  creationReason?: string;

  @IsOptional()
  @IsNumber()
  debit?: number;

  @IsOptional()
  @IsNumber()
  credit?: number;

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KafeelDto)
  kafeel?: KafeelDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientDocumentDto)
  documents?: ClientDocumentDto;
}