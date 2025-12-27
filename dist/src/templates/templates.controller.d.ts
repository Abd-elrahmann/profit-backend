import { TemplatesService } from './templates.service';
import { UpsertTemplateDto } from './dto/templates.dto';
import { TemplateType } from '@prisma/client';
export declare class TemplatesController {
    private readonly templatesService;
    constructor(templatesService: TemplatesService);
    getAllTemplates(): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }[]>;
    upsert(req: any, dto: UpsertTemplateDto): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
    getByName(name: TemplateType): Promise<{
        id: number;
        name: import("@prisma/client").$Enums.TemplateType;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        content: string;
    }>;
}
