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
dotenv.config();

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  // Temporary Register
  async register(data: { name: string; email: string; password: string; phone: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestException('Email already exists');

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: { name: data.name, email: data.email, password: hashed, phone: data.phone },
    });

    return { message: 'register successfully' };;
  }

  // Login
  async login(data: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    // create audit log
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

  // Profile
  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, roleId: true, isActive: true, createdAt: true },
    });
    return user;
  }

  // Helper: Generate JWT
  private generateToken(user: any) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, user: { id: user.id, name: user.name, email: user.email } };
  }

  async updateProfile(userId: number, data: { name?: string; phone?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (data.phone && data.phone !== user.phone) {
      const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (phoneExists) throw new BadRequestException('Phone already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name ?? user.name,
        phone: data.phone ?? user.phone,
      },
      select: { id: true, name: true, email: true, phone: true, updatedAt: true },
    });

    // create audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        screen: 'Auth',
        action: 'UPDATE',
        description: `المستخدم ${user.name} قام بتحديث ملفه الشخصي`,
      },
    });

    return { message: 'Profile updated successfully', user: updated };
  }

  async updatePassword(userId: number, dto: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isOldPasswordCorrect = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isOldPasswordCorrect) throw new UnauthorizedException('Old password is incorrect');

    const isNewSameAsOld = await bcrypt.compare(dto.newPassword, user.password);
    if (isNewSameAsOld) {
      throw new BadRequestException('New password cannot be the same as the old password');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  // 🟢 Request reset password (email)
  async requestResetPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');

    // generate secure token
    const randomToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // store in DB
    await this.prisma.resetPasswordToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // send email
    const resetLink = `http://localhost:3001/reset-password?token=${encodeURIComponent(randomToken)}`;

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
      subject: 'Reset Your Password',
      text: `Click the link below to reset your password (expires in 10 minutes): ${resetLink}`,
    });

    return { message: 'Password reset link sent to your email.' };
  }

  // 🟢 Reset password using token
  async resetPassword(data: { token: string; newPassword: string; confirmPassword: string }) {
    const hashedToken = crypto.createHash('sha256').update(data.token).digest('hex');

    const resetToken = await this.prisma.resetPasswordToken.findFirst({
      where: { token: hashedToken },
    });

    if (!resetToken) throw new BadRequestException('Invalid or expired token');
    if (resetToken.expiresAt < new Date()) {
      await this.prisma.resetPasswordToken.delete({ where: { id: resetToken.id } });
      throw new BadRequestException('Token has expired');
    }

    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    await this.prisma.resetPasswordToken.deleteMany({ where: { userId: resetToken.userId } });

    return { message: 'Password reset successfully.' };
  }
}