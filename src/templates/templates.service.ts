import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateType } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) { }

  // الحصول على جميع القوالب (جديد)
  async getAllTemplates() {
    return this.prisma.template.findMany({
      orderBy: { name: 'asc' }
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