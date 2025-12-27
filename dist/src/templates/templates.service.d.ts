import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';
export declare class TemplatesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAllTemplates(): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }[]>;
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
