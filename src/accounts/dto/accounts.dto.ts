import { IsString, IsOptional, IsEnum, IsInt, IsBoolean, IsNumber } from 'class-validator';
import { AccountType, AccountNature, AccountBasicType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsEnum(AccountBasicType)
  accountBasicType: AccountBasicType;

  @IsEnum(AccountNature)
  nature: AccountNature;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @IsOptional()
  @IsEnum(AccountBasicType)
  accountBasicType?: AccountBasicType;

  @IsOptional()
  @IsEnum(AccountNature)
  nature?: AccountNature;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}