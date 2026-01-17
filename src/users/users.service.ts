import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import moment from 'moment-hijri';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  private toHijri(date: Date) {
    return moment(date)
        .locale('ar-SA')
        .format('iDD iMMMM iYYYY')
  }

  private async generateNextCode(prefix: string): Promise<string> {
    const latest = await this.prisma.account.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });

    const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}0000`;
    return nextCode;
  }


  async addUser(currentUser, data: { name: string; email: string; password: string; phone: string; roleId?: number }) {
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new BadRequestException('الايميل موجود بالفعل');

    const existingPhone = await this.prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new BadRequestException('الرقم موجود بالفعل');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    const hashed = await bcrypt.hash(data.password, 10);

    const expenses = await this.prisma.account.findUnique({ where: { code: '52000' } });

    if (!expenses) {
      throw new BadRequestException('expense accounts (52000) must exist first');
    }

    const expensesAccount = await this.prisma.account.create({
      data: {
        name: `مصروفات - ${data.name}`,
        code: await this.generateNextCode('52'),
        parentId: expenses.id,
        type: 'EXPENSE',
        nature: 'DEBIT',
        accountBasicType: 'EXPENSES',
        level: 3,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: hashed,
        roleId: data.roleId,
        expenseAccountId: expensesAccount.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        role: {
          select: {
            name: true
          }
        },
        createdAt: true
      },
    });


    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'CREATE',
        description: `المستخدم ${current?.name} أضاف مستخدم جديد ${data.name}`,
      },
    });

    return { message: 'تم اضافة مستخدم جديد بنجاح', user };
  }


  async updateUser(id: number, currentUser, data: { name?: string; phone?: string; isActive?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (data.phone && data.phone !== user.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (phoneExists) throw new BadRequestException('الرقم موجود بالفعل');
    }

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: data.name ?? user.name,
        phone: data.phone ?? user.phone,
        isActive: data.isActive ?? user.isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        role: {
          select: {
            name: true
          }
        },
        updatedAt: true
      },
    });


    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'UPDATE',
        description: `المستخدم ${current?.name} قام بتحديث بيانات المستخدم ${user.name}`,
      },
    });

    return { message: 'تم تحديث بيانات المستخدم بنجاح', user: updated };
  }


  async deleteUser(currentUser, id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.id == 1) throw new NotFoundException('لا يمكن حذف المستخدم ');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    await this.prisma.auditLog.deleteMany({ where: { userId: id } });
    await this.prisma.resetPasswordToken.deleteMany({ where: { userId: id } });
    await this.prisma.journalHeader.updateMany({
      where: { postedById: id },
      data: { postedById: null },
    });

    await this.prisma.user.delete({ where: { id } });


    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'DELETE',
        description: `المستخدم ${current?.name} قام بحذف المستخدم ${user.name}`,
      },
    });

    return { message: 'تم حذف المستخدم بنجاح' };
  }


  async getUsers(
    page: number = 1,
    filters?: { limit?: number; name?: string; email?: string; phone?: string; roleId?: number },
  ) {
    const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
    if (filters?.email) where.email = { contains: filters.email, mode: 'insensitive' };
    if (filters?.phone) where.phone = { contains: filters.phone, mode: 'insensitive' };
    if (filters?.roleId) where.roleId = filters.roleId;

    const totalUsers = await this.prisma.user.count({ where });
    const totalPages = Math.ceil(totalUsers / limit);
    if (page > totalPages && totalUsers > 0) throw new NotFoundException('Page not found');

    const unformattedUsers = await this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        role: {
          select: {
            name: true
          }
        },
        isActive: true,
        createdAt: true
      },
    });

    const users = unformattedUsers.map((user) => ({
      ...user,
      createdAt: DateTime.fromJSDate(user.createdAt, { zone: 'utc' })
        .setZone('Asia/Riyadh')
        .toFormat('yyyy-MM-dd HH:mm:ss'),
      hijriCreatedAt: this.toHijri(user.createdAt),
    }));

    return {
      totalUsers,
      totalPages,
      currentPage: page,
      users,
    };
  }


  async assignRole(userId: number, currentUser, roleId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    await this.prisma.user.update({ where: { id: userId }, data: { roleId } });


    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'UPDATE',
        description: `المستخدم ${current?.name} قام بتعيين دور جديد للمستخدم ${user.name}`,
      },
    });

    return { message: 'تم تعيين الدور بنجاح' };
  }
}