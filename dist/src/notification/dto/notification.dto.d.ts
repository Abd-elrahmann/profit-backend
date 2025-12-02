import { TemplateType } from "@prisma/client";
export declare class SendNotificationDto {
    templateType: TemplateType;
    clientId: number;
    loanId?: number;
    repaymentId?: number;
    channel?: string;
}
