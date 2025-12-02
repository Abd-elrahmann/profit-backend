import { TemplateType } from '@prisma/client';
export declare class UpsertTemplateDto {
    name: TemplateType;
    content: string;
    description?: string;
}
