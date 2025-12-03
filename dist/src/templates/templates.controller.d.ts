import { TemplatesService } from './templates.service';
import { UpsertTemplateDto } from './dto/templates.dto';
import { TemplateType } from '@prisma/client';
export declare class TemplatesController {
    private readonly templatesService;
    constructor(templatesService: TemplatesService);
    getAllTemplates(): Promise<({
        variables: {
            id: number;
            createdAt: Date;
            description: string | null;
            key: string;
            group: string | null;
            templateId: number;
        }[];
        styles: {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            templateId: number;
            css: string;
        }[];
    } & {
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    })[]>;
    upsert(req: any, dto: UpsertTemplateDto): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
    getByName(name: TemplateType): Promise<{
        styles: {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            templateId: number;
            css: string;
        }[];
    } & {
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
    getTemplateWithVariables(name: TemplateType): Promise<{
        variables: {
            id: number;
            createdAt: Date;
            description: string | null;
            key: string;
            group: string | null;
            templateId: number;
        }[];
        styles: {
            id: number;
            createdAt: Date;
            updatedAt: Date;
            templateId: number;
            css: string;
        }[];
    } & {
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
    addVariable(templateName: TemplateType, body: {
        key: string;
        description?: string;
        group?: string;
    }): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
    updateVariable(id: string, body: {
        key: string;
        description?: string;
        group?: string;
    }): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
    deleteVariable(id: string): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
    saveStyle(templateName: TemplateType, body: {
        css: string;
    }): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        templateId: number;
        css: string;
    }>;
    getLatestStyle(templateName: TemplateType): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        templateId: number;
        css: string;
    }>;
}
