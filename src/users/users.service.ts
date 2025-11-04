import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  // Add new user
  async addUser(currentUser, data: { name: string; email: string; password: string; phone: string; roleId?: number }) {
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new BadRequestException('Email already exists');

    const existingPhone = await this.prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new BadRequestException('Phone already exists');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: hashed,
        roleId: data.roleId,
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

    // create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'CREATE',
        description: `المستخدم ${current?.name} أضاف مستخدم جديد ${data.name}`,
      },
    });

    return { message: 'User created successfully', user };
  }

  // Update user
  async updateUser(id: number, currentUser, data: { name?: string; phone?: string; isActive?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (data.phone && data.phone !== user.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (phoneExists) throw new BadRequestException('Phone already in use');
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

    // create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'UPDATE',
        description: `المستخدم ${current?.name} قام بتحديث بيانات المستخدم ${user.name}`,
      },
    });

    return { message: 'User updated successfully', user: updated };
  }

  // Delete user and cascade related records
  async deleteUser(currentUser, id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    // Delete related records
    await this.prisma.auditLog.deleteMany({ where: { userId: id } });
    await this.prisma.resetPasswordToken.deleteMany({ where: { userId: id } });
    await this.prisma.journalHeader.updateMany({
      where: { postedById: id },
      data: { postedById: null },
    });

    await this.prisma.user.delete({ where: { id } });

    // create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'DELETE',
        description: `المستخدم ${current?.name} قام بحذف المستخدم ${user.name}`,
      },
    });

    return { message: 'User and all related records deleted successfully' };
  }

  // Get all users with pagination and filters
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

    const users = await this.prisma.user.findMany({
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

    return {
      totalUsers,
      totalPages,
      currentPage: page,
      users,
    };
  }

  // Assign role to user
  async assignRole(userId: number, currentUser, roleId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const current = await this.prisma.user.findUnique({
      where: { id: currentUser },
    });

    await this.prisma.user.update({ where: { id: userId }, data: { roleId } });

    // create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: currentUser,
        screen: 'Users',
        action: 'UPDATE',
        description: `المستخدم ${current?.name} قام بتعيين دور جديد للمستخدم ${user.name}`,
      },
    });

    return { message: 'Role assigned successfully' };
  }
}