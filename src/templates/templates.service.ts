import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert template
  async upsertTemplate(data: { name: TemplateType; content: string; description?: string }) {
    return this.prisma.template.upsert({
      where: { name: data.name },
      update: {
        content: data.content,
        description: data.description,
      },
      create: {
        name: data.name,
        content: data.content,
        description: data.description,
      },
    });
  }

  // Get template by name
  async getTemplateByName(name: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name },
    });

    if (!template) throw new NotFoundException(`Template "${name}" not found`);
    return template;
  }
}