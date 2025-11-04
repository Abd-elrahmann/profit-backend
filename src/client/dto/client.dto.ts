import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsDateString,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ClientStatus {
  نشط = 'نشط',
  منتهي = 'منتهي',
  متعثر = 'متعثر',
}

export class KafeelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

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
  @Type(() => Number)
  @IsNumber()
  salary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  obligations?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ClientDocumentsDto {
  @IsOptional()
  @IsString()
  clientIdImage?: string;

  @IsOptional()
  @IsString()
  clientWorkCard?: string;

  @IsOptional()
  @IsString()
  salaryReport?: string;

  @IsOptional()
  @IsString()
  simaReport?: string;

  @IsOptional()
  @IsString()
  kafeelIdImage?: string;

  @IsOptional()
  @IsString()
  kafeelWorkCard?: string;
}

export class CreateClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  phone: string;

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

  @Type(() => Number)
  @IsNumber()
  salary: number;

  @Type(() => Number)
  @IsNumber()
  obligations: number;

  @IsString()
  creationReason: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => KafeelDto)
  kafeel?: KafeelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientDocumentsDto)
  documents?: ClientDocumentsDto;
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
  @Type(() => Number)
  @IsNumber()
  salary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  obligations?: number;

  @IsOptional()
  @IsString()
  creationReason?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => KafeelDto)
  kafeel?: KafeelDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientDocumentsDto)
  documents?: ClientDocumentsDto;
}