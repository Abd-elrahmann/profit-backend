import { IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JournalType, JournalStatus , JournalSourceType } from '@prisma/client';

export class JournalLineDto {
    @IsNumber()
    accountId: number;

    @IsOptional()
    @IsNumber()
    debit?: number;

    @IsOptional()
    @IsNumber()
    credit?: number;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsNumber()
    clientId?: number;
}

export class CreateJournalDto {
    @IsOptional()
    @IsString()
    reference?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(JournalType)
    type?: JournalType;

    @IsOptional()
    @IsEnum(JournalSourceType)
    sourceType?: JournalSourceType;

    @IsOptional()
    @IsNumber()
    sourceId?: number;

    @IsNotEmpty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => JournalLineDto)
    lines: JournalLineDto[];
}

export class UpdateJournalDto {
    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(JournalType)
    type?: JournalType;

    @IsOptional()
    @IsEnum(JournalStatus)
    status?: JournalStatus;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => JournalLineDto)
    lines?: JournalLineDto[];
}