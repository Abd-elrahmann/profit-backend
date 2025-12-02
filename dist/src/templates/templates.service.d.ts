import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';
export declare class TemplatesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
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
    addVariable(templateName: TemplateType, key: string, description?: string, group?: string): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
    updateVariable(id: number, key: string, description?: string, group?: string): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
    deleteVariable(id: number): Promise<{
        id: number;
        createdAt: Date;
        description: string | null;
        key: string;
        group: string | null;
        templateId: number;
    }>;
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
    getLatestStyle(templateName: TemplateType): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        templateId: number;
        css: string;
    }>;
    saveStyle(templateName: TemplateType, css: string): Promise<{
        id: number;
        createdAt: Date;
        updatedAt: Date;
        templateId: number;
        css: string;
    }>;
    upsertTemplate(currentUser: number, data: {
        name: TemplateType;
        content: string;
        description?: string;
    }): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
    getTemplateByName(name: TemplateType): Promise<{
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
    deleteTemplate(name: TemplateType): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
}
