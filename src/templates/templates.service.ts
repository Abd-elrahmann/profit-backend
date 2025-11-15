import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) { }

  // الحصول على القالب مع متغيراته (محدث)
  async getTemplateWithVariables(name: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name },
      include: { 
        variables: {
          orderBy: { createdAt: 'desc' }
        },
        styles: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
    });

    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  // إضافة متغير جديد (محدث لدعم المجموعات)
  async addVariable(templateName: TemplateType, key: string, description?: string, group?: string) {
    const template = await this.prisma.template.findUnique({
      where: { name: templateName },
    });
    if (!template) throw new NotFoundException('Template not found');

    return this.prisma.templateVariable.create({
      data: {
        templateId: template.id,
        key,
        description,
        group, // إضافة دعم للمجموعات
      },
    });
  }

  // تحديث المتغير (محدث لدعم المجموعات)
  async updateVariable(id: number, key: string, description?: string, group?: string) {
    return this.prisma.templateVariable.update({
      where: { id },
      data: { 
        key, 
        description,
        group // إضافة دعم للمجموعات
      },
    });
  }

  // الحصول على جميع القوالب (جديد)
  async getAllTemplates() {
    return this.prisma.template.findMany({
      include: {
        variables: true,
        styles: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  // الحصول على أحدث CSS للقالب (جديد)
  async getLatestStyle(templateName: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name: templateName },
      include: {
        styles: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!template) throw new NotFoundException('Template not found');
    return template.styles[0] || null;
  }

  // حفظ الـ CSS (محدث)
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

  // تحديث القالب (محدث)
  async upsertTemplate(currentUser: number, data: { name: TemplateType; content: string; description?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    // تسجيل في سجل التدقيق
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

  // الحصول على القالب بالاسم (محدث)
  async getTemplateByName(name: TemplateType) {
    const template = await this.prisma.template.findUnique({
      where: { name },
      include: {
        styles: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  // حذف القالب (جديد - اختياري)
  async deleteTemplate(name: TemplateType) {
    return this.prisma.template.delete({
      where: { name },
    });
  }
}