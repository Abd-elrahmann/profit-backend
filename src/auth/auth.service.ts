import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();


const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }


  async register(data: { name: string; email: string; password: string; phone: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestException('Email already exists');

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: { name: data.name, email: data.email, password: hashed, phone: data.phone },
    });

    return { message: 'register successfully' };;
  }


  async login(data: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: { role: true }
    });
    if (!user) throw new UnauthorizedException('خطأ في بيانات الدخول');

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) throw new UnauthorizedException('كلمة السر غير صحيحة');


    if (!user.roleId || !user.role) {
      throw new UnauthorizedException('ليس لديك أي صلاحيات أو أدوار للدخول على النظام. برجاء التواصل مع المدير لتعيين الصلاحية.');
    }

    
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isActive: true
      }
    })

    
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id }
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'login',
        description: `المستخدم ${user.name} قام بتسجيل الدخول`,
      },
    });

    return this.generateToken(user);
  }

  async logout(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');


    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });


    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'logout',
        description: `المستخدم ${user.name} قام بتسجيل الخروج`,
      },
    });

    return { message: 'تم تسجيل الخروج بنجاح' };
  }


  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleId: true,
        isActive: true,
        createdAt: true,
        profileImage: true,
        role: { select: { name: true } }
      },
    });
    return user;
  }


  private async generateToken(user: any) {
    const payload = { sub: user.id, email: user.email };


    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });


    const refreshToken = crypto.randomBytes(64).toString('hex');
    const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');


    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);


    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id }
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashedRefreshToken,
        expiresAt
      }
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        roleId: user.roleId,
        role: user.role ? { id: user.role.id, name: user.role.name } : null
      }
    };
  }

  async updateProfile(userId: number, data: { name?: string; phone?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    data = data ?? {};
    if (data.phone && data.phone !== user.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (phoneExists) throw new BadRequestException('رقم الهاتف مستخدم مسبقاً');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name ?? user.name,
        phone: data.phone ?? user.phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        updatedAt: true,
        profileImage: true
      },
    });


    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'UPDATE',
        description: `المستخدم ${user.name} قام بتحديث ملفه الشخصي`,
      },
    });

    return { message: 'تم تعديل البروفايل بنجاح', user: updated };
  }

  async uploadProfileImage(userId: number, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');


    const uploadDir = path.join(process.cwd(), 'uploads', 'profiles', userId.toString());
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }


    const fileExtension = path.extname(file.originalname);
    const filename = `profile-${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadDir, filename);


    fs.writeFileSync(filePath, file.buffer);


    const publicPath = `${process.env.URL}uploads/profiles/${userId}/${filename}`;


    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: publicPath },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true
      },
    });


    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'UPDATE',
        description: `المستخدم ${user.name} قام بتحديث صورته الشخصية`,
      },
    });

    return {
      message: 'تم رفع صورة البروفايل بنجاح',
      profileImage: publicPath,
      user: updatedUser
    };
  }

  async deleteProfileImage(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.profileImage) throw new BadRequestException('لا توجد صورة لحذفها');

    const filename = user.profileImage.split('/').pop();
    if (!filename) throw new BadRequestException('مسار الصورة غير صالح');
    const filePath = path.join(process.cwd(), 'uploads', 'profiles', userId.toString(), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { profileImage: null },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'UPDATE',
        description: `المستخدم ${user.name} قام بحذف صورته الشخصية`,
      },
    });

    return {
      message: 'تم حذف صورة البروفايل بنجاح',
      user: updatedUser
    };
  }

  async updatePassword(userId: number, dto: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isOldPasswordCorrect = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isOldPasswordCorrect) throw new UnauthorizedException('كلمة السر القديمة غير صحيحة');

    const isNewSameAsOld = await bcrypt.compare(dto.newPassword, user.password);
    if (isNewSameAsOld) {
      throw new BadRequestException('كلمة السر الجديدة لا يمكن أن تكون نفس القديمة');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('كلمات السر غير متطابقة');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'تم تحديث كلمة السر' };
  }


  async requestResetPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');


    const randomToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);


    await this.prisma.resetPasswordToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });


    const resetLink = `${process.env.FRONT}/reset-password?token=${encodeURIComponent(randomToken)}`;

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'اعادة تعيين كلمة السر',
      text: `اضغط على الرابط التالي لاعادة تعيين كلمة السر (ينتهي خلال 10 دقائق): ${resetLink}`,
    });

    return { message: 'تم ارسال لينك اعادة تعيين كلمة السر بإيميلك.' };
  }


  async resetPassword(data: { token: string; newPassword: string; confirmPassword: string }) {
    const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

    const resetToken = await this.prisma.resetPasswordToken.findFirst({
      where: { token: hashedToken },
    });

    if (!resetToken) throw new BadRequestException('Invalid or expired token');
    if (resetToken.expiresAt < new Date()) {
      await this.prisma.resetPasswordToken.delete({ where: { id: resetToken.id } });
      throw new BadRequestException('انتهى الرابط');
    }

    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('كلمات السر غير متطابقة');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    await this.prisma.resetPasswordToken.deleteMany({ where: { userId: resetToken.userId } });

    return { message: 'تم اعادة تعيين كلمة السر بنجاح.' };
  }

  async getUserModulePermissions(userId: number, module: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              where: { module },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    if (!user.role) return [];
    if (user.role.permissions.length === 0) return [];

    const permission = user.role.permissions[0];


    const permissionsList: string[] = [];

    if (permission.canView) permissionsList.push('View');
    if (permission.canAdd) permissionsList.push('Add');
    if (permission.canUpdate) permissionsList.push('Update');
    if (permission.canDelete) permissionsList.push('Delete');
    if (permission.canPost) permissionsList.push('Post');
    if (permission.canExport) permissionsList.push('Export');

    return permissionsList;
  }

  async getAllUserPermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    if (!user.role) return [];
    if (!user.role.permissions || user.role.permissions.length === 0) return [];

    const allPermissions: string[] = [];

    user.role.permissions.forEach((permission) => {
      let moduleKey = permission.module;
      
      switch (permission.module) {
        case 'messages-templates':
          moduleKey = 'messagesTemplates';
          break;
        case 'journal-entries':
          moduleKey = 'journalEntries';
          break;
        case 'contract-templates':
          moduleKey = 'contractTemplates';
          break;
      }

      if (permission.canView) allPermissions.push(`${moduleKey}_View`);
      if (permission.canAdd) allPermissions.push(`${moduleKey}_Add`);
      if (permission.canUpdate) allPermissions.push(`${moduleKey}_Update`);
      if (permission.canDelete) allPermissions.push(`${moduleKey}_Delete`);
      if (permission.canPost) allPermissions.push(`${moduleKey}_Post`);
      if (permission.canExport) allPermissions.push(`${moduleKey}_Export`);
    });

    return allPermissions;
  }

  async getUserModules(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    if (!user.role) throw new BadRequestException('User has no assigned role');
    if (!user.role.permissions || user.role.permissions.length === 0)
      return [];


    const modules = [...new Set(user.role.permissions.map((perm) => perm.module))];

    return modules;
  }


  async refreshAccessToken(refreshToken: string) {
    try {

      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');


      const tokenRecord = await this.prisma.refreshToken.findUnique({
        where: { token: hashedToken },
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid refresh token');
      }


      if (tokenRecord.expiresAt < new Date()) {

        await this.prisma.refreshToken.delete({
          where: { id: tokenRecord.id }
        });
        throw new UnauthorizedException('Refresh token expired');
      }


      const user = await this.prisma.user.findUnique({
        where: { id: tokenRecord.userId },
        include: { role: true }
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }


      
      const payload = { sub: user.id, email: user.email };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });

      const result = {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profileImage: user.profileImage,
          roleId: user.roleId,
          role: user.role ? { id: user.role.id, name: user.role.name } : null
        }
      };

      console.log('Refresh token successful for user:', user.id);
      return result;
    } catch (error) {
      console.error('Refresh token error:', error.message);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }


  async logoutAndInvalidateToken(userId: number, refreshToken?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');


    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });


    if (refreshToken) {
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId: userId,
          token: hashedToken
        }
      });
    } else {

      await this.prisma.refreshToken.deleteMany({
        where: { userId: userId }
      });
    }


    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'logout',
        description: `المستخدم ${user.name} قام بتسجيل الخروج`,
      },
    });

    return { message: 'تم تسجيل الخروج بنجاح' };
  }

  async logoutByRefreshToken(refreshToken: string) {
    try {
      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');


      const tokenRecord = await this.prisma.refreshToken.findFirst({
        where: { token: hashedToken }
      });

      if (!tokenRecord) {

        return { message: 'تم تسجيل الخروج بنجاح' };
      }


      const user = await this.prisma.user.findUnique({
        where: { id: tokenRecord.userId }
      });

      if (user) {

        await this.prisma.user.update({
          where: { id: tokenRecord.userId },
          data: { isActive: false },
        });


        await this.prisma.auditLog.create({
          data: {
            userId: tokenRecord.userId,
            screen: 'Auth',
            action: 'logout',
            description: `المستخدم ${user.name} قام بتسجيل الخروج`,
          },
        });
      }


      await this.prisma.refreshToken.delete({
        where: { id: tokenRecord.id }
      });

      return { message: 'تم تسجيل الخروج بنجاح' };
    } catch (error) {


      return { message: 'تم تسجيل الخروج بنجاح' };
    }
  }
}