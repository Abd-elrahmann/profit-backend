import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) { }

   // الحصول على القالب مع متغيراته
   async getTemplateWithVariables(name: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name },
      include: { 
        variables: true,
        styles: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
    });

    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  // إضافة متغير جديد
  async addVariable(templateName: TemplateType, key: string, description?: string) {
    const template = await this.prisma.template.findUnique({
      where: { name: templateName },
    });
    if (!template) throw new NotFoundException('Template not found');

    return this.prisma.templateVariable.create({
      data: {
        templateId: template.id,
        key,
        description,
      },
    });
  }

  // تحديث المتغير
  async updateVariable(id: number, key: string, description?: string) {
    return this.prisma.templateVariable.update({
      where: { id },
      data: { key, description },
    });
  }

  // حذف متغير
  async deleteVariable(id: number) {
    return this.prisma.templateVariable.delete({
      where: { id },
    });
  }

  // حفظ الـ CSS
  async saveStyle(templateName: TemplateType, css: string) {
    const template = await this.prisma.template.findUnique({
      where: { name: templateName },
    });
    if (!template) throw new NotFoundException('Template not found');

    return this.prisma.templateStyle.create({
      data: {
        templateId: template.id,
        css,
      },
    });
  }


  async upsertTemplate(currentUser, data: { name: TemplateType; content: string; description?: string }) {

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Templates',
        action: 'UPDATE',
        description: `قام ${user?.name} بتحديث القالب ${data.name}`,
      },
    });

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

  async getTemplateByName(name: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

}