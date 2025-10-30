import { TemplateType } from "@prisma/client";
import { IsEnum, IsNumber, IsString } from "class-validator";

export class SendNotificationDto {

    @IsEnum(TemplateType)
    templateType: TemplateType;

    @IsNumber()
    clientId: number;

    @IsNumber()
    loanId?: number;

    @IsNumber()
    repaymentId?: number;

    @IsString()
    channel?: string;
}